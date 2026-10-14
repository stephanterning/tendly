import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database, Transaction } from '../accounts/database.js';
import type { Actor } from '../accounts/access.js';
import { AccountError } from '../accounts/errors.js';
import { TaskService } from '../tasks/service.js';
import { tasks, taskActivities, taskDependencies } from '../tasks/schema.js';
import { lifecycleSettings } from './schema.js';
export class LifecycleService {
  readonly tasks: TaskService;
  constructor(readonly db: Database) { this.tasks = new TaskService(db); }
  async settings(householdId: string, db = this.db) {
    const [row] = await db.select().from(lifecycleSettings).where(eq(lifecycleSettings.householdId, householdId));
    return row ? { version: row.version, archiveDays: row.archiveDays, trashDays: row.trashDays } : { version: 0, archiveDays: 30, trashDays: 30 };
  }
  async saveSettings(actor: Actor, householdId: string, input: { version: number; archiveDays: number | null; trashDays: number }) {
    return this.db.transaction(async tx => {
      await this.tasks.scope(tx, actor, householdId, true, true);
      const [old] = await tx.select().from(lifecycleSettings).where(eq(lifecycleSettings.householdId, householdId));
      if ((old?.version ?? 0) !== input.version) throw new AccountError('planning_conflict', 409);
      const value = { ...input, version: input.version + 1 };
      await tx.insert(lifecycleSettings).values({ ...value, householdId }).onConflictDoUpdate({ target: lifecycleSettings.householdId, set: value });
      return value;
    });
  }
  async list(actor: Actor, householdId: string, kind: 'archive' | 'trash') {
    await this.tasks.scope(this.db, actor, householdId);
    return (await this.db.select().from(tasks).where(eq(tasks.householdId, householdId))).filter(row => kind === 'trash' ? !!row.trashedAt : !!row.archivedAt && !row.trashedAt).map(row => ({ id: row.id, title: row.title, version: row.version, parentId: row.parentId, archivedAt: row.archivedAt?.toISOString() ?? null, trashedAt: row.trashedAt?.toISOString() ?? null }));
  }
  async subtree(tx: Transaction, householdId: string, id: string) {
    const result = await tx.execute<{ id: string }>(sql`WITH RECURSIVE tree AS (SELECT id FROM tasks WHERE id = ${id} AND household_id = ${householdId} UNION SELECT t.id FROM tasks t JOIN tree p ON t.parent_id = p.id WHERE t.household_id = ${householdId}) SELECT id FROM tree`);
    return result.rows.map(r => r.id);
  }
  async permanentlyDelete(tx: Transaction, householdId: string, ids: string[]) {
    if (!ids.length) return;
    // Detach only nodes being removed so restrictive parent FKs cannot depend on row deletion order.
    await tx.update(tasks).set({ parentId: null }).where(and(eq(tasks.householdId, householdId), inArray(tasks.id, ids)));
    await tx.delete(tasks).where(and(eq(tasks.householdId, householdId), inArray(tasks.id, ids)));
  }
  async change(actor: Actor, householdId: string, id: string, version: number, action: 'archive' | 'unarchive' | 'trash' | 'restore' | 'delete', confirmed: boolean) {
    await this.db.transaction(async tx => {
      await this.tasks.scope(tx, actor, householdId, true, action === 'delete');
      const [row] = await tx.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.householdId, householdId)));
      if (!row) throw new AccountError('task_not_found', 404);
      if (row.version !== version) throw new AccountError('planning_conflict', 409);
      if (row.trashedAt && !['restore', 'delete'].includes(action)) throw new AccountError('task_not_found', 404);
      let ids = action === 'trash' || action === 'delete' ? await this.subtree(tx, householdId, id) : [id];
      if (action === 'trash' || action === 'delete') {
        const dependents = await tx.select({ id: tasks.id }).from(taskDependencies).innerJoin(tasks, eq(tasks.id, taskDependencies.blockedTaskId)).where(and(eq(tasks.householdId, householdId), inArray(taskDependencies.blockingTaskId, ids), isNull(tasks.trashedAt)));
        if (!confirmed && dependents.some(d => !ids.includes(d.id))) throw new AccountError('confirm_dependent_deletion', 409);
      }
      if (action === 'delete') { await this.permanentlyDelete(tx, householdId, ids); return; }
      if (action === 'restore') {
        if (!row.trashedAt) return;
        const batch = row.trashRootId ?? row.id;
        ids = (await tx.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.householdId, householdId), eq(tasks.trashRootId, batch)))).map(r => r.id);
        if (!ids.length) ids = [id];
        const roots = await tx.select().from(tasks).where(and(eq(tasks.householdId, householdId), inArray(tasks.id, ids)));
        const parents = roots.flatMap(r => r.parentId && !ids.includes(r.parentId) ? [r.parentId] : []);
        if (parents.length && (await tx.select().from(tasks).where(inArray(tasks.id, parents))).some(p => p.trashedAt)) throw new AccountError('restore_parent_first');
      }
      const affected = await tx.select().from(tasks).where(and(eq(tasks.householdId, householdId), inArray(tasks.id, ids)));
      for (const task of affected) {
        if (action === 'trash' && task.trashedAt) continue;
        const version = task.version + 1;
        const value = action === 'archive' ? { archivedAt: new Date() } : action === 'unarchive' ? { archivedAt: null } : action === 'trash' ? { trashedAt: new Date(), trashRootId: id } : { trashedAt: null, trashRootId: null };
        await tx.update(tasks).set({ ...value, version, updatedAt: new Date(), fieldVersions: { ...task.fieldVersions, lifecycle: version } }).where(eq(tasks.id, task.id));
        await tx.insert(taskActivities).values({ taskId: task.id, actorId: actor.user.id, version, fields: [action] });
      }
    });
  }
}
