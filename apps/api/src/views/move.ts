import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { moveTaskSchema, TaskChanges } from '@tendly/shared';
import type { Actor } from '../accounts/access.js';
import type { Database } from '../accounts/database.js';
import { AccountError } from '../accounts/errors.js';
import { TaskService, TaskConflict } from '../tasks/service.js';
import { tasks, taskActivities } from '../tasks/schema.js';
import { taskOrderVersions } from './schema.js';
export async function moveTask(
  db: Database,
  actor: Actor,
  householdId: string,
  id: string,
  input: z.infer<typeof moveTaskSchema>,
) {
  const service = new TaskService(db);
  return db.transaction(async (tx) => {
    const home = await service.scope(tx, actor, householdId, true);
    const all = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.householdId, householdId), isNull(tasks.trashedAt)))
      .orderBy(asc(tasks.order));
    const index = all.findIndex((t) => t.id === id),
      original = all[index];
    if (!original) throw new AccountError('task_not_found', 404);
    const [order] = await tx
      .select()
      .from(taskOrderVersions)
      .where(eq(taskOrderVersions.householdId, householdId));
    const reorder = input.beforeId !== undefined || input.afterId !== undefined;
    if (reorder && (order?.version ?? 0) !== input.orderVersion)
      throw new AccountError('order_conflict', 409);
    const current = await service.get(tx, householdId, id, home.timezone);
    if (
      reorder &&
      ((original.fieldVersions.order ?? 1) > input.baseVersion ||
        input.baseVersion > original.version)
    )
      throw new TaskConflict(current, ['order']);
    const inverse = {
      beforeId: all[index + 1]?.id ?? null,
      column: current.column,
      epicId: current.epicId,
    };
    const changes: TaskChanges = {
      ...(input.column === undefined ? {} : { column: input.column }),
      ...(input.epicId === undefined ? {} : { epicId: input.epicId }),
    };
    if (!reorder && !Object.keys(changes).length) throw new AccountError('invalid_input');
    let rank = original.order;
    if (reorder) {
      const rest = all.filter((t) => t.id !== id);
      const anchor = input.beforeId ?? input.afterId;
      if (anchor === id) throw new AccountError('invalid_order_target');
      const at = anchor ? rest.findIndex((t) => t.id === anchor) : rest.length;
      if (at < 0) throw new AccountError('invalid_order_target');
      const insert = anchor && input.afterId ? at + 1 : at;
      const low = rest[insert - 1]?.order ?? 0,
        high = rest[insert]?.order ?? low + 2048;
      rank = (low + high) / 2;
      if (high - low < 0.00001) {
        // Re-spacing changes representation, not relative order or anyone's content.
        for (let i = 0; i < rest.length; i++) {
          rest[i]!.order = (i + 1) * 1024;
          await tx.update(tasks).set({ order: rest[i]!.order }).where(eq(tasks.id, rest[i]!.id));
        }
        const lower = rest[insert - 1]?.order ?? 0;
        rank = (lower + (rest[insert]?.order ?? lower + 2048)) / 2;
      }
    }
    const next = await service.patchInTransaction(
      tx,
      actor,
      householdId,
      id,
      input.baseVersion,
      changes,
      input.confirmUnavailable,
    );
    if (reorder) {
      await tx
        .update(tasks)
        .set({
          order: rank,
          fieldVersions: sql`${tasks.fieldVersions} || ${JSON.stringify({ order: next.version })}::jsonb`,
        })
        .where(eq(tasks.id, id));
      await tx
        .update(taskActivities)
        .set({ fields: [...Object.keys(changes), 'order'] })
        .where(and(eq(taskActivities.taskId, id), eq(taskActivities.version, next.version)));
      await tx
        .insert(taskOrderVersions)
        .values({ householdId, version: input.orderVersion + 1 })
        .onConflictDoUpdate({
          target: taskOrderVersions.householdId,
          set: { version: input.orderVersion + 1 },
        });
    }
    return {
      task: await service.get(tx, householdId, id, home.timezone),
      orderVersion: reorder ? input.orderVersion + 1 : (order?.version ?? 0),
      inverse,
    };
  });
}
