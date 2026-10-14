import { and, eq, inArray } from 'drizzle-orm';
import { defaultView, filterDocumentSchema, viewDocumentSchema, personalViewSchema, type FilterAst, type PersonalView, type ViewDefinition } from '@tendly/shared';
import type { Actor } from '../accounts/access.js';
import type { Database, QueryDatabase } from '../accounts/database.js';
import { AccountError } from '../accounts/errors.js';
import { TaskService } from '../tasks/service.js';
import { entities } from '../tasks/schema.js';
import { filters, filterHistory, views, viewPersonal } from './schema.js';
import { filterTasks } from './filter.js';
type Identity = { name: string; icon: string; color: string };
export class PlanningService {
  readonly tasks: TaskService;
  constructor(readonly db: Database) { this.tasks = new TaskService(db); }
  async library(actor: Actor, householdId: string) {
    return this.db.transaction(async tx => {
      await this.tasks.scope(tx, actor, householdId, true);
      for (const builtin of ['now', 'board'] as const) await tx.insert(views).values({ householdId, name: builtin === 'now' ? 'Now' : 'Board', icon: builtin === 'now' ? 'house' : 'layout-grid', color: 'blue', builtin, definition: defaultView(builtin === 'now') }).onConflictDoNothing();
      const savedViews = await tx.select().from(views).where(eq(views.householdId, householdId));
      const savedFilters = await tx.select().from(filters).where(eq(filters.householdId, householdId));
      const personal = savedViews.length ? await tx.select().from(viewPersonal).where(and(eq(viewPersonal.userId, actor.user.id), inArray(viewPersonal.viewId, savedViews.map(v => v.id)))) : [];
      return { views: savedViews.map(v => viewDocumentSchema.parse(v)), filters: savedFilters.map(f => filterDocumentSchema.parse(f)), personal: Object.fromEntries(savedViews.map(v => {
        const row = personal.find(p => p.viewId === v.id);
        return [v.id, row ? { ...row, favorite: !!row.favorite } : { version: 0, activeFilters: [], favorite: !!v.builtin, currentPlace: null }];
      })) };
    });
  }
  async references(db: QueryDatabase, householdId: string, ids: string[]) {
    if (!ids.length) return;
    const found = await db.select().from(filters).where(and(eq(filters.householdId, householdId), inArray(filters.id, ids)));
    if (found.length !== new Set(ids).size) throw new AccountError('invalid_filter_reference');
  }
  async saveFilter(actor: Actor, householdId: string, value: Identity & { definition: FilterAst }, id?: string, version?: number) {
    return this.db.transaction(async tx => {
      await this.tasks.scope(tx, actor, householdId, true);
      if (id) {
        const [old] = await tx.select().from(filters).where(and(eq(filters.id, id), eq(filters.householdId, householdId)));
        if (!old) throw new AccountError('filter_not_found', 404);
        if (old.version !== version) throw new AccountError('planning_conflict', 409);
        const [row] = await tx.update(filters).set({ ...value, version: old.version + 1 }).where(eq(filters.id, id)).returning();
        await tx.insert(filterHistory).values({ filterId: id, version: row!.version, definition: value.definition, actorId: actor.user.id });
        return filterDocumentSchema.parse(row);
      }
      const [row] = await tx.insert(filters).values({ ...value, householdId, createdBy: actor.user.id }).returning();
      await tx.insert(filterHistory).values({ filterId: row!.id, version: 1, definition: value.definition, actorId: actor.user.id });
      return filterDocumentSchema.parse(row);
    });
  }
  async saveView(actor: Actor, householdId: string, value: Identity & { definition: ViewDefinition }, id?: string, version?: number) {
    return this.db.transaction(async tx => {
      await this.tasks.scope(tx, actor, householdId, true);
      await this.references(tx, householdId, value.definition.quickFilters);
      if (id) {
        const [old] = await tx.select().from(views).where(and(eq(views.id, id), eq(views.householdId, householdId)));
        if (!old) throw new AccountError('view_not_found', 404);
        if (old.version !== version) throw new AccountError('planning_conflict', 409);
        const [row] = await tx.update(views).set({ ...value, version: old.version + 1 }).where(eq(views.id, id)).returning();
        return viewDocumentSchema.parse(row);
      }
      const [row] = await tx.insert(views).values({ ...value, householdId, createdBy: actor.user.id }).returning();
      return viewDocumentSchema.parse(row);
    });
  }
  async personal(actor: Actor, householdId: string, id: string, input: PersonalView) {
    return this.db.transaction(async tx => {
      await this.tasks.scope(tx, actor, householdId, true);
      const [view] = await tx.select().from(views).where(and(eq(views.id, id), eq(views.householdId, householdId)));
      if (!view) throw new AccountError('view_not_found', 404);
      if (input.activeFilters.some(f => !view.definition.quickFilters.includes(f))) throw new AccountError('invalid_filter_reference');
      if (input.currentPlace) {
        const [place] = await tx.select().from(entities).where(and(eq(entities.id, input.currentPlace), eq(entities.householdId, householdId), eq(entities.kind, 'place')));
        if (!place) throw new AccountError('invalid_task_reference');
      }
      const where = and(eq(viewPersonal.viewId, id), eq(viewPersonal.userId, actor.user.id));
      const [old] = await tx.select().from(viewPersonal).where(where);
      if ((old?.version ?? 0) !== input.version) throw new AccountError('planning_conflict', 409);
      const value = { ...input, version: input.version + 1, favorite: input.favorite ? 1 : 0 };
      await tx.insert(viewPersonal).values({ ...value, viewId: id, userId: actor.user.id }).onConflictDoUpdate({ target: [viewPersonal.viewId, viewPersonal.userId], set: value });
      return personalViewSchema.parse({ ...value, favorite: input.favorite });
    });
  }
  async history(actor: Actor, householdId: string, id: string) {
    await this.tasks.scope(this.db, actor, householdId);
    const [filter] = await this.db.select().from(filters).where(and(eq(filters.id, id), eq(filters.householdId, householdId)));
    if (!filter) throw new AccountError('filter_not_found', 404);
    return (await this.db.select().from(filterHistory).where(eq(filterHistory.filterId, id))).map(r => ({ version: r.version, definition: r.definition, createdAt: r.createdAt.toISOString() }));
  }
  async remove(actor: Actor, householdId: string, kind: 'filter' | 'view', id: string, version: number) {
    return this.db.transaction(async tx => {
      await this.tasks.scope(tx, actor, householdId, true);
      const table = kind === 'filter' ? filters : views;
      const [old] = await tx.select().from(table).where(and(eq(table.id, id), eq(table.householdId, householdId)));
      if (!old) throw new AccountError('planning_not_found', 404);
      if (old.version !== version) throw new AccountError('planning_conflict', 409);
      if (old.builtin) throw new AccountError('builtin_view_required');
      if (kind === 'filter') {
        const linked = await tx.select().from(views).where(eq(views.householdId, householdId));
        // Remove deleted chips explicitly; never leave a saved view referring to a missing rule.
        for (const view of linked.filter(v => v.definition.quickFilters.includes(id))) await tx.update(views).set({ version: view.version + 1, definition: { ...view.definition, quickFilters: view.definition.quickFilters.filter(f => f !== id) } }).where(eq(views.id, view.id));
      }
      await tx.delete(table).where(eq(table.id, id));
    });
  }
  async results(actor: Actor, householdId: string, options: { viewId?: string; preview?: FilterAst; currentPlace?: string | null; offset: number; limit: number }) {
    return this.db.transaction(async tx => {
      const household = await this.tasks.scope(tx, actor, householdId);
      let definition = defaultView(false), currentPlace = options.currentPlace ?? null;
      const expressions: FilterAst[] = [];
      if (options.viewId) {
        const [view] = await tx.select().from(views).where(and(eq(views.id, options.viewId), eq(views.householdId, householdId)));
        if (!view) throw new AccountError('view_not_found', 404);
        definition = view.definition;
        const [personal] = await tx.select().from(viewPersonal).where(and(eq(viewPersonal.viewId, view.id), eq(viewPersonal.userId, actor.user.id)));
        currentPlace = personal?.currentPlace ?? null;
        const active = personal?.activeFilters.filter(id => definition.quickFilters.includes(id)) ?? [];
        if (active.length) expressions.push(...(await tx.select().from(filters).where(and(eq(filters.householdId, householdId), inArray(filters.id, active)))).map(f => f.definition));
      }
      expressions.unshift(options.preview ?? definition.base);
      if (options.preview) definition.subtasks = true;
      const ast: FilterAst = { type: 'group', operator: 'and', children: expressions };
      const snapshot = await this.tasks.graph(tx, householdId, household.timezone);
      const candidates = snapshot.rows.filter(r => !r.trashedAt && !r.archivedAt && (definition.subtasks || !r.parentId)).map(r => snapshot.task(r.id));
      const found = await filterTasks(tx, candidates, expressions, { userId: actor.user.id, currentPlace, timezone: household.timezone });
      found.sort((a, b) => {
        const tie = a.order - b.order || a.id.localeCompare(b.id);
        switch (definition.sort) {
          case 'deadline': return (a.deadlineDate ?? '9999').localeCompare(b.deadlineDate ?? '9999') || tie;
          case 'priority': return Number(b.high) - Number(a.high) || tie;
          case 'effort': return (['XS', 'S', 'M', 'L', 'XL'].indexOf(a.size ?? '') + 6) % 6 - (['XS', 'S', 'M', 'L', 'XL'].indexOf(b.size ?? '') + 6) % 6 || tie;
          case 'created': return a.createdAt.localeCompare(b.createdAt) || tie;
          default: return tie;
        }
      });
      return { items: found.slice(options.offset, options.offset + options.limit), count: found.length, nextOffset: found.length > options.offset + options.limit ? options.offset + options.limit : null, missingCurrentPlace: !currentPlace && JSON.stringify(ast).includes('"$place"') };
    }, { isolationLevel: 'repeatable read' });
  }
}
