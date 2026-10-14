import { occurrences, templates } from '../lifecycle/schema.js';
import { files } from '../content/schema.js';
import { inspectRichText } from '../content/rich-text.js';
import { and, asc, eq, inArray, isNull, max, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { taskFields, taskSchema, entitySchema, inheritedFields, type Task, type TaskChanges, type TaskFields, type taskCreateSchema, type entityCreateSchema, type entityPatchSchema } from '@tendly/shared';
import type { Database, QueryDatabase, Transaction } from '../accounts/database.js';
import { householdAccess, type Actor } from '../accounts/access.js';
import { households, memberships } from '../accounts/schema.js';
import { AccountError } from '../accounts/errors.js';
import { entities, tasks, taskEntities, taskAssignees, taskActivities, planningSettings, taskEntityExclusions, taskDependencies, taskRelations } from './schema.js';
import { resolveGraph } from './graph.js';
import { moveTaskToColumn, suggestSize, taskColumn } from './domain.js';

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
  async graph(db: QueryDatabase, householdId: string, timezone: string) {
    const rows = await db.select().from(tasks).where(eq(tasks.householdId, householdId)).orderBy(asc(tasks.order));
    const links = await db.select({ taskId: taskEntities.taskId, id: entities.id, kind: entities.kind }).from(taskEntities).innerJoin(tasks, eq(tasks.id, taskEntities.taskId)).innerJoin(entities, eq(entities.id, taskEntities.entityId)).where(eq(tasks.householdId, householdId));
    const exclusions = await db.select({ taskId: taskEntityExclusions.taskId, id: entities.id, kind: entities.kind }).from(taskEntityExclusions).innerJoin(tasks, eq(tasks.id, taskEntityExclusions.taskId)).innerJoin(entities, eq(entities.id, taskEntityExclusions.entityId)).where(eq(tasks.householdId, householdId));
    const assignments = await db.select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId }).from(taskAssignees).innerJoin(tasks, eq(tasks.id, taskAssignees.taskId)).where(eq(tasks.householdId, householdId));
    const dependencies = await db.select({ blocked: taskDependencies.blockedTaskId, blocker: taskDependencies.blockingTaskId }).from(taskDependencies).innerJoin(tasks, eq(tasks.id, taskDependencies.blockedTaskId)).where(eq(tasks.householdId, householdId));
    const relations = await db.select({ first: taskRelations.firstId, second: taskRelations.secondId }).from(taskRelations).innerJoin(tasks, eq(tasks.id, taskRelations.firstId)).where(eq(tasks.householdId, householdId));
    const collect = <T>(records: T[], owner: (record: T) => string) => {
      const map = new Map<string, T[]>();
      for (const record of records) { const key = owner(record); const list = map.get(key) ?? []; list.push(record); map.set(key, list); }
      return map;
    };
    const localLinks = collect(links, l => l.taskId), localExclusions = collect(exclusions, l => l.taskId);
    const localAssignments = collect(assignments, a => a.taskId), localDependencies = collect(dependencies, d => d.blocked);
    const related = new Map<string, string[]>();
    for (const pair of relations) { related.set(pair.first, [...(related.get(pair.first) ?? []), pair.second]); related.set(pair.second, [...(related.get(pair.second) ?? []), pair.first]); }
    const graph = resolveGraph(rows.map(row => ({ id: row.id, trashed: !!row.trashedAt, local: taskFields.parse({
      ...row, column: taskColumn(row),
      assignees: (localAssignments.get(row.id) ?? []).map(a => a.userId).sort(),
      ...Object.fromEntries(['place', 'resource', 'tag'].flatMap(kind => [
        [kind + 's', (localLinks.get(row.id) ?? []).filter(l => l.kind === kind).map(l => l.id).sort()],
        [kind + 'Exclusions', (localExclusions.get(row.id) ?? []).filter(l => l.kind === kind).map(l => l.id).sort()],
      ])),
      blockers: (localDependencies.get(row.id) ?? []).map(d => d.blocker).sort(), related: (related.get(row.id) ?? []).sort(),
    }) })), timezone);
    const series = await db.select({ rootId: occurrences.rootId, templateId: occurrences.templateId }).from(occurrences).innerJoin(templates, eq(templates.id, occurrences.templateId)).where(eq(templates.householdId, householdId));
    const byId = new Map(rows.map(row => [row.id, row]));
    return { rows, graph, task: (id: string) => {
      const row = byId.get(id);
      if (!row || row.trashedAt) throw new AccountError('task_not_found', 404);
      const details = graph.details(id);
      const recurrenceTemplateId = series.find(s => s.rootId === id || details.ancestors.some(a => a.id === s.rootId))?.templateId ?? null;
      return taskSchema.parse({ ...row, ...details, recurrenceTemplateId, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null });
    } };
  }
  async hydrate(db: QueryDatabase, rows: Row[], timezone: string): Promise<Task[]> {
    if (!rows.length) return [];
    const context = await this.graph(db, rows[0]!.householdId, timezone);
    return rows.map(row => context.task(row.id));
  }
  async get(db: QueryDatabase, householdId: string, id: string, timezone: string) {
    return (await this.graph(db, householdId, timezone)).task(id);
  }
  async list(actor: Actor, householdId: string, view: 'now' | 'board', offset: number, limit: number, includeSubtasks = false, parentId?: string, search = '') {
    // One snapshot prevents mixed parent/child values during concurrent edits.
    return this.db.transaction(async tx => {
      const household = await this.scope(tx, actor, householdId);
      const context = await this.graph(tx, householdId, household.timezone);
      const selected: Task[] = [];
      let matched = 0;
      for (const row of context.rows) {
        if (row.trashedAt || row.archivedAt || !row.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())) continue;
        if (parentId !== undefined ? row.parentId !== parentId : view === 'board' && !includeSubtasks && row.parentId !== null) continue;
        const task = context.task(row.id);
        if (view === 'now' && (!['within_month', 'todo', 'in_progress'].includes(task.column) || !task.available)) continue;
        if (matched++ >= offset) selected.push(task);
        if (selected.length > limit) break;
      }
      return { items: selected.slice(0, limit), nextOffset: selected.length > limit ? offset + limit : null };
    }, { isolationLevel: 'repeatable read' });
  }
  async validateContent(db: QueryDatabase, householdId: string, value: string) {
    const content = inspectRichText(value);
    if (content.mentions.some(id => !z.uuid().safeParse(id).success)) throw new AccountError('invalid_rich_text');
    if (content.mentions.length) {
      const found = await db.select().from(memberships).where(and(eq(memberships.householdId, householdId), inArray(memberships.userId, content.mentions)));
      if (found.length !== content.mentions.length) throw new AccountError('invalid_task_reference');
    }
    if (content.images.length) {
      const found = await db.select().from(files).where(and(eq(files.householdId, householdId), inArray(files.id, content.images)));
      if (found.length !== content.images.length) throw new AccountError('invalid_task_reference');
    }
  }
  async validate(db: QueryDatabase, householdId: string, value: TaskFields, previous?: Task) {
    await this.validateContent(db, householdId, value.description);
    if ((!value.startDate && value.startTime) || (!value.deadlineDate && value.deadlineTime)) throw new AccountError('date_required');
    const expected = [
      ...(value.epicId ? [{ id: value.epicId, kind: 'epic' }] : []),
      ...value.placeExclusions.map(id => ({ id, kind: 'place' })), ...value.resourceExclusions.map(id => ({ id, kind: 'resource' })), ...value.tagExclusions.map(id => ({ id, kind: 'tag' })),
      ...value.places.map(id => ({ id, kind: 'place' })), ...value.resources.map(id => ({ id, kind: 'resource' })), ...value.tags.map(id => ({ id, kind: 'tag' })),
    ];
    const records = expected.length ? await db.select().from(entities).where(and(eq(entities.householdId, householdId), inArray(entities.id, expected.map(e => e.id)))) : [];
    for (const item of expected) {
      const record = records.find(e => e.id === item.id && e.kind === item.kind);
      if (!record) throw new AccountError('invalid_task_reference');
      if (record.archived && (item.kind === 'epic' ? previous?.epicId !== item.id : ![...(previous?.places ?? []), ...(previous?.resources ?? []), ...(previous?.tags ?? [])].includes(item.id))) throw new AccountError('entity_archived');
    }
    const references = [...new Set([...(value.parentId ? [value.parentId] : []), ...value.blockers, ...value.related])];
    if (references.length) {
      const found = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.householdId, householdId), inArray(tasks.id, references), isNull(tasks.trashedAt)));
      const known = new Set(found.map(t => t.id));
      // Previously deleted blockers remain removable and unresolved, never silently completed.
      if (references.some(id => !known.has(id) && !(previous?.local.blockers.includes(id) && value.blockers.includes(id) && value.parentId !== id && !value.related.includes(id)))) throw new AccountError('invalid_task_reference');
      if (previous && value.related.includes(previous.id)) throw new AccountError('invalid_task_reference');
    }
    if (previous && value.parentId && value.parentId !== previous.parentId) {
      const descendants = await db.execute<{ id: string }>(sql`WITH RECURSIVE descendants AS (
        SELECT id FROM tasks WHERE id = ${previous.id} AND household_id = ${householdId}
        UNION SELECT t.id FROM tasks t JOIN descendants d ON t.parent_id = d.id WHERE t.household_id = ${householdId}
      ) SELECT id FROM descendants WHERE id = ${value.parentId}`);
      if (descendants.rows.length) throw new AccountError('task_cycle');
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
  async graphCollections(db: Transaction, id: string, value: TaskFields, actorId: string | null) {
    await db.delete(taskEntityExclusions).where(eq(taskEntityExclusions.taskId, id));
    const excluded = [...new Set([...value.placeExclusions, ...value.resourceExclusions, ...value.tagExclusions])];
    if (excluded.length) await db.insert(taskEntityExclusions).values(excluded.map(entityId => ({ taskId: id, entityId })));
    await db.delete(taskDependencies).where(eq(taskDependencies.blockedTaskId, id));
    if (value.blockers.length) await db.insert(taskDependencies).values([...new Set(value.blockers)].map(blockingTaskId => ({ blockedTaskId: id, blockingTaskId })));
    const old = await db.select().from(taskRelations).where(or(eq(taskRelations.firstId, id), eq(taskRelations.secondId, id)));
    const previous = old.map(pair => pair.firstId === id ? pair.secondId : pair.firstId);
    const changed = new Set([...previous.filter(peer => !value.related.includes(peer)), ...value.related.filter(peer => !previous.includes(peer))]);
    if (!changed.size) return;
    await db.delete(taskRelations).where(or(eq(taskRelations.firstId, id), eq(taskRelations.secondId, id)));
    if (value.related.length) await db.insert(taskRelations).values([...new Set(value.related)].map(peer => { const [firstId, secondId] = [id, peer].sort(); return { firstId: firstId!, secondId: secondId! }; }));
    for (const peer of changed) {
      const [row] = await db.select().from(tasks).where(eq(tasks.id, peer));
      if (!row) continue;
      await db.update(tasks).set({ version: row.version + 1, fieldVersions: { ...row.fieldVersions, related: row.version + 1 }, updatedAt: new Date() }).where(eq(tasks.id, peer));
      await db.insert(taskActivities).values({ taskId: peer, actorId, version: row.version + 1, fields: ['related'] });
    }
  }
  values(value: TaskFields) {
    const { blockers: _blockers, related: _related, placeExclusions: _pe, resourceExclusions: _re, tagExclusions: _te, column: _column, places: _places, resources: _resources, tags: _tags, assignees: _assignees, ...plain } = value;
    void _blockers; void _related; void _pe; void _re; void _te; void _column; void _places; void _resources; void _tags; void _assignees;
    return plain;
  }
  async create(actor: Actor, householdId: string, input: z.infer<typeof taskCreateSchema>) {
    return this.db.transaction(async tx => {
      const household = await this.scope(tx, actor, householdId, true);
      const value = taskFields.parse({ parentId: null, inherit: input.parentId ? inheritedFields.filter(field => input[field] === undefined) : [], placeExclusions: [], resourceExclusions: [], tagExclusions: [], blockers: [], related: [], description: '', column: 'someday', epicId: null, high: false, size: null, estimateMinutes: null, startDate: null, startTime: null, deadlineDate: null, deadlineTime: null, assignees: [], places: [], resources: [], tags: [], ...input });
      await this.validate(tx, householdId, value);
      if (!value.size && value.estimateMinutes) value.size = suggestSize(value.estimateMinutes, (await this.settings(tx, householdId)).thresholds);
      const [last] = await tx.select({ value: max(tasks.order) }).from(tasks).where(eq(tasks.householdId, householdId));
      const workflow = moveTaskToColumn({ status: 'todo', bucket: 'someday', precedingColumn: null }, value.column);
      const [row] = await tx.insert(tasks).values({
        ...this.values(value), ...workflow, householdId, order: (last?.value ?? 0) + 1024, createdBy: actor.user.id,
        completedAt: value.column === 'done' ? new Date() : null, completedBy: value.column === 'done' ? actor.user.id : null,
      }).returning();
      await this.collections(tx, row!.id, value);
      await this.graphCollections(tx, row!.id, value, actor.user.id);
      const created = await this.graph(tx, householdId, household.timezone);
      created.graph.validateDependencies();
      if (value.column === 'in_progress' && !created.task(row!.id).available && !input.confirmUnavailable) throw new AccountError('confirm_unavailable', 409);
      await tx.insert(taskActivities).values({ taskId: row!.id, actorId: actor.user.id, version: 1, fields: ['created'] });
      return created.task(row!.id);
    });
  }
  async patch(actor: Actor, householdId: string, id: string, baseVersion: number, changes: TaskChanges, confirmUnavailable = false, confirmDescendants = false) {
    return this.db.transaction(async tx => {
      // The household row serializes all graph writers, including reparenting and edge edits.
      // Validate after tentative writes so the transaction rolls back any effective cycle.
      const household = await this.scope(tx, actor, householdId, true);
      const [row] = await tx.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.householdId, householdId), isNull(tasks.trashedAt))).for('update');
      if (!row) throw new AccountError('task_not_found', 404);
      const current = (await this.hydrate(tx, [row], household.timezone))[0]!;
      const checked = new Set(Object.keys(changes));
      if (['inherit', 'parentId'].some(key => checked.has(key))) inheritedFields.forEach(key => checked.add(key));
      if (inheritedFields.some(key => checked.has(key))) { checked.add('inherit'); checked.add('parentId'); }
      for (const [add, exclude] of [['places', 'placeExclusions'], ['resources', 'resourceExclusions'], ['tags', 'tagExclusions']]) if (checked.has(add!) || checked.has(exclude!)) { checked.add(add!); checked.add(exclude!); checked.add('parentId'); }
      // Date and optional time form one logical field, even when edited separately.
      for (const pair of [['startDate', 'startTime'], ['deadlineDate', 'deadlineTime']]) {
        if (pair.some(key => checked.has(key))) pair.forEach(key => checked.add(key));
      }
      const conflicts = [...checked].filter(key => (row.fieldVersions[key] ?? 1) > baseVersion);
      if (baseVersion > row.version || conflicts.length) throw new TaskConflict(current, conflicts.length ? conflicts : Object.keys(changes));
      const workflow = moveTaskToColumn(row, changes.column ?? current.column);
      const next = taskFields.parse({ ...current.local, ...changes, column: taskColumn(workflow) });
      if (changes.inherit === undefined && current.local.inherit.includes('startDate') && (changes.startDate !== undefined || changes.startTime !== undefined)) { next.startDate = changes.startDate === undefined ? current.startDate : changes.startDate; next.startTime = changes.startTime === undefined ? current.startTime : changes.startTime; }
      if (changes.inherit === undefined && current.local.inherit.includes('deadlineDate') && (changes.deadlineDate !== undefined || changes.deadlineTime !== undefined)) { next.deadlineDate = changes.deadlineDate === undefined ? current.deadlineDate : changes.deadlineDate; next.deadlineTime = changes.deadlineTime === undefined ? current.deadlineTime : changes.deadlineTime; }
      if (changes.inherit === undefined) next.inherit = next.inherit.filter(key => changes[key] === undefined && !(key === 'startDate' && changes.startTime !== undefined) && !(key === 'deadlineDate' && changes.deadlineTime !== undefined));
      if (!next.startDate) next.startTime = null;
      if (!next.deadlineDate) next.deadlineTime = null;
      const changed = new Set(Object.keys(changes));
      if (JSON.stringify(next.inherit) !== JSON.stringify(current.local.inherit)) changed.add('inherit');
      if (next.startTime !== current.local.startTime) changed.add('startTime');
      if (next.deadlineTime !== current.local.deadlineTime) changed.add('deadlineTime');
      // An exact duration only suggests an empty size; explicit sizes always survive.
      if (!next.size && next.estimateMinutes && changes.estimateMinutes !== undefined && changes.size === undefined && (row.fieldVersions.size ?? 1) <= baseVersion) {
        next.size = suggestSize(next.estimateMinutes, (await this.settings(tx, householdId)).thresholds);
        changed.add('size');
      }
      await this.validate(tx, householdId, next, current);
      const version = row.version + 1;
      const fieldVersions = { ...row.fieldVersions, ...Object.fromEntries([...changed].map(key => [key, version])) };
      // Completion metadata changes with the visible column, never with unrelated edits.
      const completion = next.column === current.column ? {} : {
        completedAt: next.column === 'done' ? new Date() : null,
        completedBy: next.column === 'done' ? actor.user.id : null,
      };
      await tx.update(tasks).set({ ...this.values(next), ...workflow, ...completion, version, fieldVersions, updatedAt: new Date() }).where(eq(tasks.id, id));
      await this.collections(tx, id, next);
      await this.graphCollections(tx, id, next, actor.user.id);
      const updated = await this.graph(tx, householdId, household.timezone);
      updated.graph.validateDependencies();
      const resolved = updated.task(id);
      if (next.column === 'in_progress' && current.column !== 'in_progress' && !resolved.available && !confirmUnavailable) throw new AccountError('confirm_unavailable', 409);
      if (next.column === 'done' && current.column !== 'done' && resolved.unfinishedDescendants && !confirmDescendants) throw new AccountError('confirm_descendants', 409);
      await tx.insert(taskActivities).values({ taskId: id, actorId: actor.user.id, version, fields: [...changed] });
      return resolved;
    });
  }
  async reorder(actor: Actor, householdId: string, id: string, baseVersion: number, beforeId: string | null) {
    return this.db.transaction(async tx => {
      const household = await this.scope(tx, actor, householdId, true);
      const rows = await tx.select().from(tasks).where(and(eq(tasks.householdId, householdId), isNull(tasks.trashedAt))).orderBy(asc(tasks.order), asc(tasks.id));
      const current = rows.find(r => r.id === id);
      if (!current) throw new AccountError('task_not_found', 404);
      if ((current.fieldVersions.order ?? 1) > baseVersion || baseVersion > current.version) throw new AccountError('planning_conflict', 409);
      if (beforeId === id) return this.get(tx, householdId, id, household.timezone);
      const others = rows.filter(r => r.id !== id);
      const index = beforeId ? others.findIndex(r => r.id === beforeId) : others.length;
      if (index < 0) throw new AccountError('invalid_task_reference');
      const next = others[index]?.order, previous = others[index - 1]?.order;
      const order = previous === undefined ? (next ?? 1024) - 1024 : next === undefined ? previous + 1024 : (previous + next) / 2;
      // Rebalance only when floating-point gaps are exhausted. Relative order is unchanged.
      if (order === previous || order === next) {
        others.splice(index, 0, current);
        for (const [i, row] of others.entries()) await tx.update(tasks).set({ order: (i + 1) * 1024 }).where(eq(tasks.id, row.id));
      } else await tx.update(tasks).set({ order }).where(eq(tasks.id, id));
      await tx.update(tasks).set({ version: current.version + 1, fieldVersions: { ...current.fieldVersions, order: current.version + 1 }, updatedAt: new Date() }).where(eq(tasks.id, id));
      await tx.insert(taskActivities).values({ taskId: id, actorId: actor.user.id, version: current.version + 1, fields: ['order'] });
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
      const excluded = await tx.select({ taskId: taskEntityExclusions.taskId }).from(taskEntityExclusions).where(eq(taskEntityExclusions.entityId, id));
      const affected = await tx.select().from(tasks).where(and(eq(tasks.householdId, householdId), entity.kind === 'epic' ? eq(tasks.epicId, id) : inArray(tasks.id, [...linked, ...excluded].map(l => l.taskId))));
      const field = entity.kind === 'epic' ? 'epicId' : ({ place: 'places', resource: 'resources', tag: 'tags' } as const)[entity.kind];
      for (const task of affected) {
        await tx.update(tasks).set({ version: task.version + 1, fieldVersions: { ...task.fieldVersions, [field]: task.version + 1, ...(entity.kind !== 'epic' ? { [entity.kind + 'Exclusions']: task.version + 1 } : {}) }, updatedAt: new Date() }).where(eq(tasks.id, task.id));
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
