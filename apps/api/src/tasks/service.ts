import { and, asc, eq, gt, inArray, isNull, max } from 'drizzle-orm';
import { z } from 'zod';
import { taskFields, taskSchema, entitySchema, type Task, type TaskChanges, type TaskFields, type taskCreateSchema, type entityCreateSchema, type entityPatchSchema } from '@tendly/shared';
import type { Database, QueryDatabase, Transaction } from '../accounts/database.js';
import { householdAccess, type Actor } from '../accounts/access.js';
import { households, memberships } from '../accounts/schema.js';
import { AccountError } from '../accounts/errors.js';
import { entities, tasks, taskEntities, taskAssignees, taskActivities, planningSettings } from './schema.js';
import { availability, moveTaskToColumn, suggestSize, taskColumn } from './domain.js';

type Row = typeof tasks.$inferSelect;
export class TaskConflict extends AccountError {
  constructor(readonly current: Task, readonly fields: string[]) { super('task_conflict', 409); }
}
export class TaskService {
  constructor(readonly db: Database) {}
  async scope(db: QueryDatabase, actor: Actor, householdId: string, lock = false, admin = false) {
    await householdAccess(db, actor, householdId, admin);
    const query = db.select().from(households).where(eq(households.id, householdId));
    const [household] = lock ? await query.for('update') : await query;
    if (!household) throw new AccountError('household_not_found', 404);
    if (lock) await householdAccess(db, actor, householdId, admin);
    return household;
  }
  async settings(db: QueryDatabase, householdId: string) {
    const [row] = await db.select().from(planningSettings).where(eq(planningSettings.householdId, householdId));
    return row ? { version: row.version, thresholds: row.thresholds } : { version: 0, thresholds: [60, 240, 480, 1440] as [number, number, number, number] };
  }
  async hydrate(db: QueryDatabase, rows: Row[], timezone: string): Promise<Task[]> {
    if (!rows.length) return [];
    const ids = rows.map(r => r.id);
    const links = await db.select({ taskId: taskEntities.taskId, id: entities.id, kind: entities.kind }).from(taskEntities).innerJoin(entities, eq(entities.id, taskEntities.entityId)).where(inArray(taskEntities.taskId, ids));
    const assignees = await db.select().from(taskAssignees).where(inArray(taskAssignees.taskId, ids));
    return rows.map(row => {
      const column = taskColumn(row);
      return taskSchema.parse({
        ...row, column, ...availability({ ...row, column }, timezone),
        createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null,
        assignees: assignees.filter(a => a.taskId === row.id).map(a => a.userId).sort(),
        places: links.filter(l => l.taskId === row.id && l.kind === 'place').map(l => l.id).sort(),
        resources: links.filter(l => l.taskId === row.id && l.kind === 'resource').map(l => l.id).sort(),
        tags: links.filter(l => l.taskId === row.id && l.kind === 'tag').map(l => l.id).sort(),
      });
    });
  }
  async get(db: QueryDatabase, householdId: string, id: string, timezone: string) {
    const [row] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.householdId, householdId), isNull(tasks.trashedAt)));
    if (!row) throw new AccountError('task_not_found', 404);
    return (await this.hydrate(db, [row], timezone))[0]!;
  }
  async list(actor: Actor, householdId: string, view: 'now' | 'board', offset: number, limit: number) {
    const household = await this.scope(this.db, actor, householdId);
    const selected: Row[] = [];
    let cursor = -1, matched = 0, more = true;
    // Bound each scan; filter before pagination. There is no silent household task cap.
    // Stage 5's filter compiler will extend this same effective-result boundary.
    while (more && selected.length <= limit) {
      const batch = await this.db.select().from(tasks).where(and(eq(tasks.householdId, householdId), isNull(tasks.trashedAt), isNull(tasks.archivedAt), gt(tasks.order, cursor))).orderBy(asc(tasks.order)).limit(256);
      more = batch.length === 256;
      for (const row of batch) {
        cursor = row.order;
        const column = taskColumn(row);
        if (view === 'now' && (!['within_month', 'todo', 'in_progress'].includes(column) || !availability({ ...row, column }, household.timezone).available)) continue;
        if (matched++ >= offset) selected.push(row);
        if (selected.length > limit) break;
      }
    }
    return { items: await this.hydrate(this.db, selected.slice(0, limit), household.timezone), nextOffset: selected.length > limit ? offset + limit : null };
  }
  async validate(db: QueryDatabase, householdId: string, value: TaskFields, previous?: Task) {
    if ((!value.startDate && value.startTime) || (!value.deadlineDate && value.deadlineTime)) throw new AccountError('date_required');
    const expected = [
      ...(value.epicId ? [{ id: value.epicId, kind: 'epic' }] : []),
      ...value.places.map(id => ({ id, kind: 'place' })), ...value.resources.map(id => ({ id, kind: 'resource' })), ...value.tags.map(id => ({ id, kind: 'tag' })),
    ];
    const records = expected.length ? await db.select().from(entities).where(and(eq(entities.householdId, householdId), inArray(entities.id, expected.map(e => e.id)))) : [];
    for (const item of expected) {
      const record = records.find(e => e.id === item.id && e.kind === item.kind);
      if (!record) throw new AccountError('invalid_task_reference');
      if (record.archived && (item.kind === 'epic' ? previous?.epicId !== item.id : ![...(previous?.places ?? []), ...(previous?.resources ?? []), ...(previous?.tags ?? [])].includes(item.id))) throw new AccountError('entity_archived');
    }
    if (value.assignees.length) {
      const members = await db.select().from(memberships).where(and(eq(memberships.householdId, householdId), inArray(memberships.userId, value.assignees)));
      if (new Set(value.assignees).size !== members.length) throw new AccountError('invalid_task_reference');
    }
  }
  async collections(db: Transaction, id: string, value: TaskFields) {
    await db.delete(taskEntities).where(eq(taskEntities.taskId, id));
    const entityIds = [...new Set([...value.places, ...value.resources, ...value.tags])];
    if (entityIds.length) await db.insert(taskEntities).values(entityIds.map(entityId => ({ taskId: id, entityId })));
    await db.delete(taskAssignees).where(eq(taskAssignees.taskId, id));
    if (value.assignees.length) await db.insert(taskAssignees).values([...new Set(value.assignees)].map(userId => ({ taskId: id, userId })));
  }
  values(value: TaskFields) {
    const { column: _column, places: _places, resources: _resources, tags: _tags, assignees: _assignees, ...plain } = value;
    void _column; void _places; void _resources; void _tags; void _assignees;
    return plain;
  }
  async create(actor: Actor, householdId: string, input: z.infer<typeof taskCreateSchema>) {
    return this.db.transaction(async tx => {
      const household = await this.scope(tx, actor, householdId, true);
      const value = taskFields.parse({ description: '', column: 'someday', epicId: null, high: false, size: null, estimateMinutes: null, startDate: null, startTime: null, deadlineDate: null, deadlineTime: null, assignees: [], places: [], resources: [], tags: [], ...input });
      await this.validate(tx, householdId, value);
      if (value.column === 'in_progress' && !availability(value, household.timezone).available && !input.confirmUnavailable) throw new AccountError('confirm_unavailable', 409);
      if (!value.size && value.estimateMinutes) value.size = suggestSize(value.estimateMinutes, (await this.settings(tx, householdId)).thresholds);
      const [last] = await tx.select({ value: max(tasks.order) }).from(tasks).where(eq(tasks.householdId, householdId));
      const workflow = moveTaskToColumn({ status: 'todo', bucket: 'someday', precedingColumn: null }, value.column);
      const [row] = await tx.insert(tasks).values({
        ...this.values(value), ...workflow, householdId, order: (last?.value ?? 0) + 1024, createdBy: actor.user.id,
        completedAt: value.column === 'done' ? new Date() : null, completedBy: value.column === 'done' ? actor.user.id : null,
      }).returning();
      await this.collections(tx, row!.id, value);
      await tx.insert(taskActivities).values({ taskId: row!.id, actorId: actor.user.id, version: 1, fields: ['created'] });
      return this.get(tx, householdId, row!.id, household.timezone);
    });
  }
  async patch(actor: Actor, householdId: string, id: string, baseVersion: number, changes: TaskChanges, confirmUnavailable = false) {
    return this.db.transaction(async tx => {
      const household = await this.scope(tx, actor, householdId, true);
      const [row] = await tx.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.householdId, householdId), isNull(tasks.trashedAt))).for('update');
      if (!row) throw new AccountError('task_not_found', 404);
      const current = (await this.hydrate(tx, [row], household.timezone))[0]!;
      const checked = new Set(Object.keys(changes));
      // Date and optional time form one logical field, even when edited separately.
      for (const pair of [['startDate', 'startTime'], ['deadlineDate', 'deadlineTime']]) {
        if (pair.some(key => checked.has(key))) pair.forEach(key => checked.add(key));
      }
      const conflicts = [...checked].filter(key => (row.fieldVersions[key] ?? 1) > baseVersion);
      if (baseVersion > row.version || conflicts.length) throw new TaskConflict(current, conflicts.length ? conflicts : Object.keys(changes));
      const workflow = moveTaskToColumn(row, changes.column ?? current.column);
      const next = taskFields.parse({ ...current, ...changes, column: taskColumn(workflow) });
      if (!next.startDate) next.startTime = null;
      if (!next.deadlineDate) next.deadlineTime = null;
      const changed = new Set(Object.keys(changes));
      if (next.startTime !== current.startTime) changed.add('startTime');
      if (next.deadlineTime !== current.deadlineTime) changed.add('deadlineTime');
      // An exact duration only suggests an empty size; explicit sizes always survive.
      if (!next.size && next.estimateMinutes && changes.estimateMinutes !== undefined && changes.size === undefined && (row.fieldVersions.size ?? 1) <= baseVersion) {
        next.size = suggestSize(next.estimateMinutes, (await this.settings(tx, householdId)).thresholds);
        changed.add('size');
      }
      await this.validate(tx, householdId, next, current);
      if (next.column === 'in_progress' && current.column !== 'in_progress' && !availability(next, household.timezone).available && !confirmUnavailable) throw new AccountError('confirm_unavailable', 409);
      const version = row.version + 1;
      const fieldVersions = { ...row.fieldVersions, ...Object.fromEntries([...changed].map(key => [key, version])) };
      // Completion metadata changes with the visible column, never with unrelated edits.
      const completion = next.column === current.column ? {} : {
        completedAt: next.column === 'done' ? new Date() : null,
        completedBy: next.column === 'done' ? actor.user.id : null,
      };
      await tx.update(tasks).set({ ...this.values(next), ...workflow, ...completion, version, fieldVersions, updatedAt: new Date() }).where(eq(tasks.id, id));
      await this.collections(tx, id, next);
      await tx.insert(taskActivities).values({ taskId: id, actorId: actor.user.id, version, fields: [...changed] });
      return this.get(tx, householdId, id, household.timezone);
    });
  }
  async entityList(actor: Actor, householdId: string) {
    await this.scope(this.db, actor, householdId);
    return (await this.db.select().from(entities).where(eq(entities.householdId, householdId)).orderBy(asc(entities.order))).map(e => entitySchema.parse(e));
  }
  async entityWrite(actor: Actor, householdId: string, input: z.infer<typeof entityCreateSchema> | z.infer<typeof entityPatchSchema>['changes'], id?: string, baseVersion?: number) {
    return this.db.transaction(async tx => {
      await this.scope(tx, actor, householdId, true);
      if (id) {
        const [old] = await tx.select().from(entities).where(and(eq(entities.id, id), eq(entities.householdId, householdId)));
        if (!old) throw new AccountError('entity_not_found', 404);
        if (old.version !== baseVersion) throw new AccountError('entity_conflict', 409);
        const [row] = await tx.update(entities).set({ ...input, version: old.version + 1 }).where(eq(entities.id, id)).returning();
        return entitySchema.parse(row);
      }
      const [last] = await tx.select({ value: max(entities.order) }).from(entities).where(eq(entities.householdId, householdId));
      const creation = input as z.infer<typeof entityCreateSchema>;
      const [row] = await tx.insert(entities).values({ ...creation, householdId, order: (last?.value ?? 0) + 1024 }).returning();
      return entitySchema.parse(row);
    });
  }
  async entityDelete(actor: Actor, householdId: string, id: string, baseVersion: number) {
    return this.db.transaction(async tx => {
      await this.scope(tx, actor, householdId, true);
      const [entity] = await tx.select().from(entities).where(and(eq(entities.id, id), eq(entities.householdId, householdId)));
      if (!entity) throw new AccountError('entity_not_found', 404);
      if (entity.version !== baseVersion) throw new AccountError('entity_conflict', 409);
      const linked = await tx.select({ taskId: taskEntities.taskId }).from(taskEntities).where(eq(taskEntities.entityId, id));
      const affected = await tx.select().from(tasks).where(and(eq(tasks.householdId, householdId), entity.kind === 'epic' ? eq(tasks.epicId, id) : inArray(tasks.id, linked.map(l => l.taskId))));
      const field = entity.kind === 'epic' ? 'epicId' : ({ place: 'places', resource: 'resources', tag: 'tags' } as const)[entity.kind];
      for (const task of affected) {
        await tx.update(tasks).set({ version: task.version + 1, fieldVersions: { ...task.fieldVersions, [field]: task.version + 1 }, updatedAt: new Date() }).where(eq(tasks.id, task.id));
        await tx.insert(taskActivities).values({ taskId: task.id, actorId: actor.user.id, version: task.version + 1, fields: [field] });
      }
      await tx.delete(entities).where(eq(entities.id, id));
    });
  }
  async reorderEntity(actor: Actor, householdId: string, id: string, direction: 'up' | 'down', baseVersion: number) {
    return this.db.transaction(async tx => {
      await this.scope(tx, actor, householdId, true);
      const all = await tx.select().from(entities).where(and(eq(entities.householdId, householdId), eq(entities.kind, 'epic'))).orderBy(asc(entities.order));
      const at = all.findIndex(e => e.id === id);
      const item = all[at];
      if (!item) throw new AccountError('entity_not_found', 404);
      if (item.version !== baseVersion) throw new AccountError('entity_conflict', 409);
      const other = all[at + (direction === 'up' ? -1 : 1)];
      if (other) {
        await tx.update(entities).set({ order: other.order, version: item.version + 1 }).where(eq(entities.id, item.id));
        await tx.update(entities).set({ order: item.order, version: other.version + 1 }).where(eq(entities.id, other.id));
      }
    });
  }
  async updateSettings(actor: Actor, householdId: string, baseVersion: number, thresholds: [number, number, number, number]) {
    return this.db.transaction(async tx => {
      await this.scope(tx, actor, householdId, true, true);
      const old = await this.settings(tx, householdId);
      if (old.version !== baseVersion) throw new AccountError('entity_conflict', 409);
      await tx.insert(planningSettings).values({ householdId, thresholds, version: old.version + 1 }).onConflictDoUpdate({ target: planningSettings.householdId, set: { thresholds, version: old.version + 1 } });
      return { thresholds, version: old.version + 1 };
    });
  }
}
