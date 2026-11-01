import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  allTasks,
  filterVersionSchema,
  filterFieldsSchema,
  savedFilterSchema,
  savedViewSchema,
  viewFieldsSchema,
  parseExpression,
  type TaskQuery,
  type FilterExpression,
} from '@tendly/shared';
import type { Actor } from '../accounts/access.js';
import type { Database, QueryDatabase } from '../accounts/database.js';
import { users, memberships } from '../accounts/schema.js';
import { entities } from '../tasks/schema.js';
import { TaskService } from '../tasks/service.js';
import { AccountError } from '../accounts/errors.js';
import {
  filters,
  filterVersions,
  views,
  viewStates,
  viewContexts,
  taskOrderVersions,
} from './schema.js';
import { defaultFilters, defaultView } from './defaults.js';
import { matchingTasks } from './query.js';

type FilterFields = z.infer<typeof filterFieldsSchema>;
type ViewFields = z.infer<typeof viewFieldsSchema>;
export class ViewService {
  readonly tasks: TaskService;
  constructor(readonly db: Database) {
    this.tasks = new TaskService(db);
  }
  async initialize(actor: Actor, householdId: string) {
    await this.db.transaction(async (tx) => {
      await this.tasks.scope(tx, actor, householdId, true);
      for (const [builtin, value] of Object.entries(defaultFilters)) {
        const [created] = await tx
          .insert(filters)
          .values({ ...value, builtin, householdId })
          .onConflictDoNothing()
          .returning();
        if (created)
          await tx
            .insert(filterVersions)
            .values({ filterId: created.id, version: 1, snapshot: value });
      }
      const shared = await tx.select().from(filters).where(eq(filters.householdId, householdId));
      const quick = Object.keys(defaultFilters).map(
        (key) => shared.find((f) => f.builtin === key)!.id,
      );
      for (const builtin of ['now', 'board'] as const)
        await tx
          .insert(views)
          .values({
            ...defaultView(builtin, quick),
            expression: parseExpression(defaultView(builtin, quick).expression),
            builtin,
            householdId,
          })
          .onConflictDoNothing();
    });
  }
  async catalog(actor: Actor, householdId: string) {
    await this.initialize(actor, householdId);
    const [filterRows, viewRows, stateRows, context] = await Promise.all([
      this.db
        .select({ row: filters, creator: users.name })
        .from(filters)
        .leftJoin(users, eq(users.id, filters.creatorId))
        .where(eq(filters.householdId, householdId))
        .orderBy(asc(filters.name)),
      this.db
        .select({ row: views, creator: users.name })
        .from(views)
        .leftJoin(users, eq(users.id, views.creatorId))
        .where(eq(views.householdId, householdId))
        .orderBy(asc(views.name)),
      this.db
        .select({ state: viewStates })
        .from(viewStates)
        .innerJoin(views, eq(views.id, viewStates.viewId))
        .where(and(eq(views.householdId, householdId), eq(viewStates.userId, actor.user.id))),
      this.context(actor, householdId),
    ]);
    return {
      filters: filterRows.map(({ row, creator }) =>
        savedFilterSchema.parse({ ...row, creator: creator ?? 'Tendly' }),
      ),
      views: viewRows.map(({ row, creator }) =>
        savedViewSchema.parse({ ...row, creator: creator ?? 'Tendly' }),
      ),
      states: Object.fromEntries(stateRows.map(({ state }) => [state.viewId, state])),
      context,
    };
  }
  async context(actor: Actor, householdId: string, db: QueryDatabase = this.db) {
    await this.tasks.scope(db, actor, householdId);
    const [row] = await db
      .select()
      .from(viewContexts)
      .where(
        and(eq(viewContexts.householdId, householdId), eq(viewContexts.userId, actor.user.id)),
      );
    return row ?? { version: 0, currentPlaceId: null };
  }
  async references(db: QueryDatabase, householdId: string, expression: unknown) {
    const tree = parseExpression(expression);
    const walk = async (node: FilterExpression): Promise<void> => {
      if (node.type === 'group') {
        for (const child of node.children) await walk(child);
        return;
      }
      if (!Array.isArray(node.value) || !node.value.length) return;
      if (node.field === 'assignees') {
        const rows = await db
          .select({ id: memberships.userId })
          .from(memberships)
          .where(
            and(eq(memberships.householdId, householdId), inArray(memberships.userId, node.value)),
          );
        if (new Set(node.value).size !== rows.length)
          throw new AccountError('invalid_filter_reference');
      }
      const kind = (
        { epicId: 'epic', places: 'place', resources: 'resource', tags: 'tag' } as const
      )[node.field as 'epicId' | 'places' | 'resources' | 'tags'];
      if (kind) {
        const rows = await db
          .select({ id: entities.id })
          .from(entities)
          .where(
            and(
              eq(entities.householdId, householdId),
              eq(entities.kind, kind),
              inArray(entities.id, node.value),
            ),
          );
        if (new Set(node.value).size !== rows.length)
          throw new AccountError('invalid_filter_reference');
      }
    };
    await walk(tree);
    return tree;
  }
  async filterWrite(
    actor: Actor,
    householdId: string,
    input: FilterFields,
    id?: string,
    baseVersion?: number,
    deleted?: boolean,
  ) {
    return this.db.transaction(async (tx) => {
      await this.tasks.scope(tx, actor, householdId, true);
      const expression = deleted
        ? parseExpression(input.expression)
        : await this.references(tx, householdId, input.expression);
      const values = { ...filterFieldsSchema.parse(input), expression };
      let row;
      if (id) {
        const [old] = await tx
          .select()
          .from(filters)
          .where(and(eq(filters.id, id), eq(filters.householdId, householdId)));
        if (!old) throw new AccountError('filter_not_found', 404);
        if (old.version !== baseVersion) throw new AccountError('filter_conflict', 409);
        [row] = await tx
          .update(filters)
          .set({
            ...values,
            version: old.version + 1,
            ...(deleted === undefined ? {} : { deleted }),
          })
          .where(eq(filters.id, id))
          .returning();
      } else
        [row] = await tx
          .insert(filters)
          .values({ ...values, householdId, creatorId: actor.user.id })
          .returning();
      await tx.insert(filterVersions).values({
        filterId: row!.id,
        version: row!.version,
        authorId: actor.user.id,
        snapshot: values,
      });
      const [creator] = row!.creatorId
        ? await tx.select({ name: users.name }).from(users).where(eq(users.id, row!.creatorId))
        : [];
      return savedFilterSchema.parse({ ...row, creator: creator?.name ?? 'Tendly' });
    });
  }
  async filterCommand(
    actor: Actor,
    householdId: string,
    id: string,
    baseVersion: number,
    command: 'delete' | 'undelete' | 'reset' | 'restore',
    version?: number,
  ) {
    await this.tasks.scope(this.db, actor, householdId);
    const [old] = await this.db
      .select()
      .from(filters)
      .where(and(eq(filters.id, id), eq(filters.householdId, householdId)));
    if (!old) throw new AccountError('filter_not_found', 404);
    let input: FilterFields = filterFieldsSchema.parse(old);
    if (command === 'reset') {
      if (!old.builtin || !defaultFilters[old.builtin]) throw new AccountError('no_defaults');
      input = defaultFilters[old.builtin]!;
    }
    if (command === 'restore') {
      const [history] = await this.db
        .select()
        .from(filterVersions)
        .where(and(eq(filterVersions.filterId, id), eq(filterVersions.version, version ?? -1)));
      if (!history) throw new AccountError('version_not_found', 404);
      input = filterFieldsSchema.parse(history.snapshot);
    }
    return this.filterWrite(
      actor,
      householdId,
      input,
      id,
      baseVersion,
      command === 'delete'
        ? true
        : command === 'undelete' || command === 'reset'
          ? false
          : undefined,
    );
  }
  async history(actor: Actor, householdId: string, id: string) {
    await this.tasks.scope(this.db, actor, householdId);
    const rows = await this.db
      .select({
        version: filterVersions.version,
        createdAt: filterVersions.createdAt,
        snapshot: filterVersions.snapshot,
        author: users.name,
      })
      .from(filterVersions)
      .innerJoin(filters, eq(filters.id, filterVersions.filterId))
      .leftJoin(users, eq(users.id, filterVersions.authorId))
      .where(and(eq(filters.householdId, householdId), eq(filters.id, id)))
      .orderBy(desc(filterVersions.version));
    if (!rows.length) throw new AccountError('filter_not_found', 404);
    return rows.map((r) =>
      filterVersionSchema.parse({
        ...r,
        createdAt: r.createdAt.toISOString(),
        author: r.author ?? 'Tendly',
      }),
    );
  }
  async viewWrite(
    actor: Actor,
    householdId: string,
    input: ViewFields,
    id?: string,
    baseVersion?: number,
    deleted?: boolean,
  ) {
    return this.db.transaction(async (tx) => {
      await this.tasks.scope(tx, actor, householdId, true);
      const values = {
        ...viewFieldsSchema.parse(input),
        expression: deleted
          ? parseExpression(input.expression)
          : await this.references(tx, householdId, input.expression),
      };
      const quick = values.quickFilters.length
        ? await tx
            .select()
            .from(filters)
            .where(
              and(
                eq(filters.householdId, householdId),
                inArray(filters.id, values.quickFilters),
                eq(filters.deleted, false),
              ),
            )
        : [];
      if (new Set(values.quickFilters).size !== quick.length)
        throw new AccountError('invalid_filter_reference');
      let row;
      if (id) {
        const [old] = await tx
          .select()
          .from(views)
          .where(and(eq(views.householdId, householdId), eq(views.id, id)));
        if (!old) throw new AccountError('view_not_found', 404);
        if (old.version !== baseVersion) throw new AccountError('view_conflict', 409);
        if (deleted && old.builtin) throw new AccountError('builtin_view_required', 409);
        [row] = await tx
          .update(views)
          .set({
            ...values,
            version: old.version + 1,
            ...(deleted === undefined ? {} : { deleted }),
          })
          .where(eq(views.id, id))
          .returning();
      } else
        [row] = await tx
          .insert(views)
          .values({ ...values, householdId, creatorId: actor.user.id })
          .returning();
      const [creator] = row!.creatorId
        ? await tx.select({ name: users.name }).from(users).where(eq(users.id, row!.creatorId))
        : [];
      return savedViewSchema.parse({ ...row, creator: creator?.name ?? 'Tendly' });
    });
  }
  async viewCommand(
    actor: Actor,
    householdId: string,
    id: string,
    baseVersion: number,
    command: 'delete' | 'undelete' | 'reset',
  ) {
    await this.tasks.scope(this.db, actor, householdId);
    const [old] = await this.db
      .select()
      .from(views)
      .where(and(eq(views.id, id), eq(views.householdId, householdId)));
    if (!old) throw new AccountError('view_not_found', 404);
    const available = await this.db
      .select()
      .from(filters)
      .where(and(eq(filters.householdId, householdId), eq(filters.deleted, false)));
    const quick = old.quickFilters.filter((id) => available.some((f) => f.id === id));
    if (command === 'reset' && old.builtin !== 'now' && old.builtin !== 'board')
      throw new AccountError('no_defaults');
    const input =
      command === 'reset'
        ? defaultView(
            old.builtin as 'now' | 'board',
            Object.keys(defaultFilters).flatMap((key) =>
              available.filter((f) => f.builtin === key).map((f) => f.id),
            ),
          )
        : viewFieldsSchema.parse({ ...old, quickFilters: quick });
    return this.viewWrite(actor, householdId, input, id, baseVersion, command === 'delete');
  }
  async stateWrite(
    actor: Actor,
    householdId: string,
    id: string,
    baseVersion: number,
    changes: { favorite?: boolean | undefined; activeFilters?: string[] | undefined },
  ) {
    return this.db.transaction(async (tx) => {
      await this.tasks.scope(tx, actor, householdId, true);
      const [view] = await tx
        .select()
        .from(views)
        .where(and(eq(views.id, id), eq(views.householdId, householdId), eq(views.deleted, false)));
      if (!view) throw new AccountError('view_not_found', 404);
      const [old] = await tx
        .select()
        .from(viewStates)
        .where(and(eq(viewStates.viewId, id), eq(viewStates.userId, actor.user.id)));
      if ((old?.version ?? 0) !== baseVersion)
        throw new AccountError('personal_state_conflict', 409);
      if (changes.activeFilters?.some((id) => !view.quickFilters.includes(id)))
        throw new AccountError('invalid_filter_reference');
      const value = {
        ...changes,
        activeFilters: changes.activeFilters
          ? [...new Set(changes.activeFilters)]
          : (old?.activeFilters ?? []),
        version: baseVersion + 1,
      };
      const [row] = await tx
        .insert(viewStates)
        .values({ viewId: id, userId: actor.user.id, ...value })
        .onConflictDoUpdate({ target: [viewStates.viewId, viewStates.userId], set: value })
        .returning();
      return row!;
    });
  }
  async contextWrite(
    actor: Actor,
    householdId: string,
    baseVersion: number,
    currentPlaceId: string | null,
  ) {
    return this.db.transaction(async (tx) => {
      await this.tasks.scope(tx, actor, householdId, true);
      const old = await this.context(actor, householdId, tx);
      if (old.version !== baseVersion) throw new AccountError('personal_state_conflict', 409);
      if (currentPlaceId)
        await this.references(tx, householdId, {
          type: 'predicate',
          field: 'places',
          operator: 'IN',
          value: [currentPlaceId],
        });
      const [row] = await tx
        .insert(viewContexts)
        .values({ householdId, userId: actor.user.id, version: baseVersion + 1, currentPlaceId })
        .onConflictDoUpdate({
          target: [viewContexts.householdId, viewContexts.userId],
          set: { version: baseVersion + 1, currentPlaceId },
        })
        .returning();
      return row!;
    });
  }
  async query(actor: Actor, householdId: string, input: TaskQuery, includeArchived = false) {
    return this.db.transaction(
      (tx) => this.queryWithin(tx, actor, householdId, input, includeArchived),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async queryWithin(
    db: QueryDatabase,
    actor: Actor,
    householdId: string,
    input: TaskQuery,
    includeArchived = false,
  ) {
    const household = await this.tasks.scope(db, actor, householdId);
    let expression: FilterExpression = allTasks,
      sort: ViewFields['sort'] = 'manual',
      active = input.filterIds ?? [];
    if (input.viewId) {
      const [view] = await db
        .select()
        .from(views)
        .where(
          and(
            eq(views.id, input.viewId),
            eq(views.householdId, householdId),
            eq(views.deleted, false),
          ),
        );
      if (!view) throw new AccountError('view_not_found', 404);
      expression = parseExpression(view.expression);
      sort = viewFieldsSchema.shape.sort.parse(view.sort);
      const [state] = await db
        .select()
        .from(viewStates)
        .where(and(eq(viewStates.viewId, view.id), eq(viewStates.userId, actor.user.id)));
      active = (state?.activeFilters ?? []).filter(
        (id) => view.quickFilters.includes(id) && id !== input.replaceFilterId,
      );
    }
    const definitions = active.length
      ? await db
          .select()
          .from(filters)
          .where(and(eq(filters.householdId, householdId), inArray(filters.id, active)))
      : [];
    if (!input.viewId && new Set(active).size !== definitions.length)
      throw new AccountError('invalid_filter_reference');
    const expressions = [
      expression,
      ...definitions.filter((f) => !f.deleted).map((f) => f.expression),
      ...(input.expression ? [parseExpression(input.expression)] : []),
    ];
    const context = await this.context(actor, householdId, db);
    const [order] = await db
      .select()
      .from(taskOrderVersions)
      .where(eq(taskOrderVersions.householdId, householdId));
    const result = await matchingTasks(
      db,
      this.tasks,
      householdId,
      expressions,
      {
        userId: actor.user.id,
        currentPlaceId: context.currentPlaceId,
        timezone: household.timezone,
        now: Date.now(),
      },
      { offset: input.offset, limit: input.limit, sort, includeArchived },
    );
    return { ...result, orderVersion: order?.version ?? 0 };
  }
}
