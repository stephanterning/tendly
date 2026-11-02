import { sql, type SQL } from 'drizzle-orm';
import { plainText, searchHitSchema } from '@tendly/shared';
import type { z } from 'zod';
import type { Actor } from '../accounts/access.js';
import type { Database } from '../accounts/database.js';
import { TaskService } from '../tasks/service.js';
import { ViewService } from '../views/service.js';
import { tasks, entities } from '../tasks/schema.js';
import { comments } from './schema.js';

export async function searchContent(
  db: Database,
  actor: Actor,
  householdId: string,
  q: string,
  offset: number,
  filterIds: string[],
) {
  return db.transaction(
    async (tx) => {
      await new TaskService(db).scope(tx, actor, householdId);
      // Read definitions, effective task values and content in the same snapshot.
      const filtered = filterIds.length
        ? await new ViewService(db).queryWithin(
            tx,
            actor,
            householdId,
            { filterIds, offset: 0, limit: Number.MAX_SAFE_INTEGER },
            true,
          )
        : null;
      const warnings = filtered?.warnings ?? [];
      const items: z.infer<typeof searchHitSchema>[] = [];
      if (warnings.length) return { items, nextOffset: null, warnings };
      const ids = filtered?.items.map((t) => t.id) ?? [];
      const restrict = (id: SQL) =>
        filtered
          ? sql` AND ${id} IN (SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)::uuid)`
          : sql``;
      const needle = q.toLowerCase();
      let scanned = 0,
        matched = 0;
      while (items.length < 51) {
        const batch = await tx.execute(sql`
        SELECT * FROM (
          SELECT id, 'task' as kind, title, description as body, id as "taskId"
          FROM ${tasks} WHERE household_id=${householdId} AND trashed_at IS NULL ${restrict(sql`id`)}
          UNION ALL
          SELECT c.id, 'comment', t.title, c.body, t.id FROM ${comments} c JOIN ${tasks} t ON t.id=c.task_id
          WHERE t.household_id=${householdId} AND t.trashed_at IS NULL AND NOT c.deleted ${restrict(sql`t.id`)}
          UNION ALL
          SELECT id, kind::text, name, to_jsonb(description), NULL::uuid FROM ${entities}
          WHERE household_id=${householdId} AND kind IN ('epic','tag') AND ${!filtered}
        ) hits ORDER BY title,id,kind LIMIT 256 OFFSET ${scanned}`);
        for (const row of batch.rows) {
          // Inline marks split text nodes without inserting spaces. Reuse the exact
          // projection used by description filters rather than joining JSONPath leaves.
          const text = plainText(row.body ?? '');
          if (
            !text.toLowerCase().includes(needle) &&
            (row.kind === 'comment' || !String(row.title).toLowerCase().includes(needle))
          )
            continue;
          if (matched++ >= offset)
            items.push(searchHitSchema.parse({ ...row, snippet: searchSnippet(text, needle) }));
          if (items.length === 51) break;
        }
        if (batch.rows.length < 256) break;
        scanned += batch.rows.length;
      }
      return {
        items: items.slice(0, 50),
        nextOffset: items.length > 50 ? offset + 50 : null,
        warnings,
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}

function searchSnippet(text: string, needle: string) {
  const start = Math.max(0, text.toLowerCase().indexOf(needle) - 70);
  return (start ? '…' : '') + text.slice(start, start + 250) + (start + 250 < text.length ? '…' : '');
}
