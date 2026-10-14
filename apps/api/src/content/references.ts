import { sql } from 'drizzle-orm';
import type { QueryDatabase } from '../accounts/database.js';
export async function fileIsReferenced(db: QueryDatabase, householdId: string, id: string) {
  const result = await db.execute(sql`SELECT 1 FROM (
    SELECT id FROM tasks WHERE household_id = ${householdId} AND position(${id} in description) > 0
    UNION ALL SELECT id FROM task_comments WHERE household_id = ${householdId} AND position(${id} in body) > 0
    UNION ALL SELECT id FROM task_templates WHERE household_id = ${householdId} AND position(${id} in nodes::text) > 0
  ) references_to_file LIMIT 1`);
  return result.rows.length > 0;
}
