import { randomUUID } from 'node:crypto';
import { and, eq, inArray, max } from 'drizzle-orm';
import { Temporal } from '@js-temporal/polyfill';
import { templateSchema, type TemplateNode, type Recurrence } from '@tendly/shared';
import type { Database, Transaction } from '../accounts/database.js';
import type { Actor } from '../accounts/access.js';
import { AccountError } from '../accounts/errors.js';
import { TaskService } from '../tasks/service.js';
import { tasks, taskActivities } from '../tasks/schema.js';
import { resolveGraph } from '../tasks/graph.js';
import { moveTaskToColumn } from '../tasks/domain.js';
import { templates, occurrences } from './schema.js';
import { materializeNodes } from './recurrence.js';
export class TemplateService {
  readonly tasks: TaskService;
  constructor(readonly db: Database) { this.tasks = new TaskService(db); }
  async list(actor: Actor, householdId: string) {
    await this.tasks.scope(this.db, actor, householdId);
    return (await this.db.select().from(templates).where(eq(templates.householdId, householdId))).map(t => templateSchema.parse(t));
  }
  async capture(actor: Actor, householdId: string, taskId: string, name: string, recurrence: Recurrence | null) {
    return this.db.transaction(async tx => {
      const household = await this.tasks.scope(tx, actor, householdId, true);
      const snapshot = await this.tasks.graph(tx, householdId, household.timezone);
      const root = snapshot.task(taskId), selected = new Set([taskId]);
      let last = 0;
      while (last !== selected.size) { last = selected.size; for (const row of snapshot.rows) if (!row.trashedAt && row.parentId && selected.has(row.parentId)) selected.add(row.id); }
      const anchor = recurrence?.anchor ?? root.startDate ?? Temporal.Now.plainDateISO(household.timezone).toString();
      const offset = (date: string | null) => date ? Temporal.PlainDate.from(anchor).until(date).days : null;
      const nodes = [...selected].map(id => { const task = snapshot.task(id); return { sourceId: id, value: id === taskId ? { ...task.local, parentId: null, inherit: [], blockers: task.effectiveBlockers.map(b => b.id), epicId: task.epicId, high: task.high, assignees: task.assignees, places: task.places, resources: task.resources, tags: task.tags, startDate: task.startDate, startTime: task.startTime, deadlineDate: task.deadlineDate, deadlineTime: task.deadlineTime } : task.local, startOffset: offset(id === taskId ? task.startDate : task.local.startDate), deadlineOffset: offset(id === taskId ? task.deadlineDate : task.local.deadlineDate) }; });
      if (recurrence) nodes[0]!.startOffset = 0;
      return this.write(tx, householdId, { name, nodes, recurrence });
    });
  }
  async validate(tx: Transaction, householdId: string, nodes: TemplateNode[], retainedTemplate = false) {
    const ids = new Set(nodes.map(n => n.sourceId));
    if (ids.size !== nodes.length || nodes.filter(n => !n.value.parentId).length !== 1 || nodes.some(n => n.value.parentId && !ids.has(n.value.parentId))) throw new AccountError('invalid_template_tree');
    resolveGraph(nodes.map(n => ({ id: n.sourceId, local: n.value, trashed: false })), 'UTC').validateDependencies();
    for (const node of nodes) {
      const external = [...node.value.blockers, ...node.value.related].filter(id => !ids.has(id));
      const found = external.length ? await tx.select().from(tasks).where(inArray(tasks.id, external)) : [];
      if (found.some(t => t.householdId !== householdId)) throw new AccountError('invalid_task_reference');
      await this.tasks.validate(tx, householdId, { ...node.value, startDate: node.startOffset === null ? null : '2000-01-01', startTime: node.startOffset === null ? null : node.value.startTime, deadlineDate: node.deadlineOffset === null ? null : '2000-01-01', deadlineTime: node.deadlineOffset === null ? null : node.value.deadlineTime, parentId: null, blockers: [], related: [] }, undefined, retainedTemplate);
    }
  }
  async write(tx: Transaction, householdId: string, value: { name: string; nodes: TemplateNode[]; recurrence: Recurrence | null }, id?: string, version?: number) {
    await this.validate(tx, householdId, value.nodes);
    if (value.recurrence) {
      const root = value.nodes.find(n => !n.value.parentId)!;
      if (root.startOffset === null) root.startOffset = 0;
    }
    if (id) {
      const [old] = await tx.select().from(templates).where(and(eq(templates.id, id), eq(templates.householdId, householdId)));
      if (!old) throw new AccountError('template_not_found', 404);
      if (old.version !== version) throw new AccountError('planning_conflict', 409);
      const [updated] = await tx.update(templates).set({ ...value, version: old.version + 1 }).where(eq(templates.id, id)).returning();
      return templateSchema.parse(updated);
    }
    const [created] = await tx.insert(templates).values({ ...value, householdId }).returning();
    return templateSchema.parse(created);
  }
  async save(actor: Actor, householdId: string, value: { name: string; nodes: TemplateNode[]; recurrence: Recurrence | null }, id: string, version: number) {
    return this.db.transaction(async tx => { await this.tasks.scope(tx, actor, householdId, true); return this.write(tx, householdId, value, id, version); });
  }
  async instantiate(tx: Transaction, template: typeof templates.$inferSelect, date: string, timezone: string, actorId: string | null, scheduled: boolean) {
    if (scheduled) {
      const [existing] = await tx.select().from(occurrences).where(and(eq(occurrences.templateId, template.id), eq(occurrences.date, date)));
      if (existing) return existing.rootId;
    }
    // Archiving an entity hides new assignments but preserves existing template references.
    await this.validate(tx, template.householdId, template.nodes, true);
    const nodes = materializeNodes(template.nodes, date, randomUUID), rootId = nodes.find(n => !n.value.parentId)!.id;
    const [last] = await tx.select({ order: max(tasks.order) }).from(tasks).where(eq(tasks.householdId, template.householdId));
    const remaining = new Map(nodes.map(n => [n.id, n])), written = new Set<string>();
    // Parent-first insertion satisfies the FK; dependency edges are written only after every node exists.
    while (remaining.size) for (const [id, node] of remaining) if (!node.value.parentId || written.has(node.value.parentId)) {
      await tx.insert(tasks).values({ ...this.tasks.values(node.value), ...moveTaskToColumn({ status: 'todo', bucket: 'someday', precedingColumn: null }, node.value.column), id, householdId: template.householdId, order: (last?.order ?? 0) + (written.size + 1) * 1024, createdBy: actorId, completedAt: node.value.column === 'done' ? new Date() : null, completedBy: node.value.column === 'done' ? actorId : null });
      written.add(id); remaining.delete(id);
    }
    for (const node of nodes) {
      await this.tasks.collections(tx, node.id, node.value);
      // Related external tasks may have been removed since capture; blockers intentionally retain missing targets.
      const existingRelated = node.value.related.length ? await tx.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.householdId, template.householdId), inArray(tasks.id, node.value.related))) : [];
      await this.tasks.graphCollections(tx, node.id, { ...node.value, related: existingRelated.map(t => t.id) }, actorId);
      await tx.insert(taskActivities).values({ taskId: node.id, actorId, version: 1, fields: [scheduled ? 'recurrence_created' : 'template_created'] });
    }
    (await this.tasks.graph(tx, template.householdId, timezone)).graph.validateDependencies();
    if (scheduled) await tx.insert(occurrences).values({ templateId: template.id, date, rootId });
    return rootId;
  }
  async createInstance(actor: Actor, householdId: string, id: string, date: string) {
    return this.db.transaction(async tx => {
      const household = await this.tasks.scope(tx, actor, householdId, true);
      const [template] = await tx.select().from(templates).where(and(eq(templates.id, id), eq(templates.householdId, householdId)));
      if (!template) throw new AccountError('template_not_found', 404);
      const rootId = await this.instantiate(tx, template, date, household.timezone, actor.user.id, false);
      return this.tasks.get(tx, householdId, rootId, household.timezone);
    });
  }
  async remove(actor: Actor, householdId: string, id: string, version: number) {
    await this.db.transaction(async tx => {
      await this.tasks.scope(tx, actor, householdId, true);
      const [row] = await tx.select().from(templates).where(and(eq(templates.id, id), eq(templates.householdId, householdId)));
      if (!row) throw new AccountError('template_not_found', 404);
      if (row.version !== version) throw new AccountError('planning_conflict', 409);
      await tx.delete(templates).where(eq(templates.id, id));
    });
  }
}
