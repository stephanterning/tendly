import { cleanOrphanFiles } from '../content/cleanup.js';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, inArray } from 'drizzle-orm';
import { Temporal } from '@js-temporal/polyfill';
import type { PgBoss } from 'pg-boss';
import * as schema from '../db/schema.js';
import type { Database } from '../accounts/database.js';
import type { readConfig } from '../config.js';
import { TemplateService } from './templates.js';
import { LifecycleService } from './service.js';
import { dueOccurrences } from './recurrence.js';
export async function maintainHousehold(db: Database, householdId: string, now = new Date()) {
  const templates = new TemplateService(db), lifecycle = new LifecycleService(db);
  await db.transaction(async tx => {
    // Jobs have no user session: constrain and lock their household explicitly, just like HTTP mutations.
    const [household] = await tx.select().from(schema.households).where(eq(schema.households.id, householdId)).for('update');
    if (!household) return;
    const localNow = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(household.timezone);
    const today = localNow.toPlainDate().toString();
    const series = await tx.select().from(schema.templates).where(eq(schema.templates.householdId, householdId));
    for (const template of series) if (template.recurrence?.enabled) {
      const existing = new Set((await tx.select().from(schema.occurrences).where(eq(schema.occurrences.templateId, template.id))).map(o => o.date));
      let created = 0;
      for (const date of dueOccurrences(template.recurrence, today)) if (!existing.has(date)) {
        await templates.instantiate(tx, template, date, household.timezone, null, true);
        if (++created >= 100) break; // Bound catch-up transactions; the next run safely resumes.
      }
    }
    const [settings] = await tx.select().from(schema.lifecycleSettings).where(eq(schema.lifecycleSettings.householdId, householdId));
    const archiveDays = settings ? settings.archiveDays : 30, trashDays = settings?.trashDays ?? 30;
    const archiveCutoff = archiveDays === null ? null : localNow.subtract({ days: archiveDays }).epochMilliseconds;
    const graph = await lifecycle.tasks.graph(tx, householdId, household.timezone);
    for (const task of graph.rows) {
      if (task.trashedAt || task.archivedAt || archiveDays === null || !task.completedAt || archiveCutoff === null || task.completedAt.getTime() > archiveCutoff || graph.task(task.id).unfinishedDescendants) continue;
      await tx.update(schema.tasks).set({ archivedAt: now, version: task.version + 1, fieldVersions: { ...task.fieldVersions, lifecycle: task.version + 1 }, updatedAt: now }).where(and(eq(schema.tasks.id, task.id), eq(schema.tasks.householdId, householdId)));
      await tx.insert(schema.taskActivities).values({ taskId: task.id, version: task.version + 1, fields: ['auto_archived'] });
    }
    const cutoff = localNow.subtract({ days: trashDays }).epochMilliseconds, removed = new Set<string>();
    for (const task of graph.rows) if (task.trashedAt && task.trashedAt.getTime() <= cutoff && !removed.has(task.id)) {
      const ids = await lifecycle.subtree(tx, householdId, task.id);
      const rows = await tx.select().from(schema.tasks).where(and(eq(schema.tasks.householdId, householdId), inArray(schema.tasks.id, ids)));
      if (rows.some(r => !r.trashedAt || r.trashedAt.getTime() > cutoff)) continue;
      await lifecycle.permanentlyDelete(tx, householdId, ids);
      ids.forEach(id => removed.add(id));
    }
  });
}
export async function registerLifecycleJobs(boss: PgBoss, config: ReturnType<typeof readConfig>) {
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 5000 });
  pool.on('error', () => console.error('Lifecycle worker database connection failed'));
  const db = drizzle(pool, { schema });
  await boss.createQueue('household-maintenance');
  await boss.work('household-maintenance', async () => {
    const households = await db.select({ id: schema.households.id }).from(schema.households);
    // Independent transactions let one household retry without duplicating another household's instances.
    const failures: unknown[] = [];
    for (const household of households) {
      try { await maintainHousehold(db, household.id); }
      catch (error) { failures.push(error); }
    }
    await cleanOrphanFiles(db, '/data/attachments');
    // A broken series must not starve later households; still fail the job so pg-boss retries it.
    if (failures.length) throw new AggregateError(failures, 'Household maintenance needs retry');
  });
  await boss.schedule('household-maintenance', '* * * * *');
  return () => pool.end();
}
