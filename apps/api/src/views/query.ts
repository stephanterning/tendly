import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import {
  filterFields,
  plainText,
  taskSchema,
  type FilterExpression,
  type Task,
  type ViewFields,
} from '@tendly/shared';
import type { QueryDatabase } from '../accounts/database.js';
import { tasks } from '../tasks/schema.js';
import type { TaskService } from '../tasks/service.js';
import { compileFilter, type FilterContext } from './compiler.js';

export function taskComparator(sort: ViewFields['sort']) {
  const nullLast = (a: string | number | null, b: string | number | null) =>
    a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;
  return (a: Task, b: Task) => {
    let difference = 0;
    if (sort === 'deadline')
      difference = nullLast(
        a.deadlineDate ? a.deadlineDate + 'T' + (a.deadlineTime ?? '23:59:59') : null,
        b.deadlineDate ? b.deadlineDate + 'T' + (b.deadlineTime ?? '23:59:59') : null,
      );
    if (sort === 'high') difference = Number(b.high) - Number(a.high);
    if (sort === 'effort') {
      const rank = (t: Task) => (t.size ? ['XS', 'S', 'M', 'L', 'XL'].indexOf(t.size) : null);
      difference = nullLast(rank(a), rank(b)) || nullLast(a.estimateMinutes, b.estimateMinutes);
    }
    if (sort === 'created') difference = b.createdAt.localeCompare(a.createdAt);
    return difference || a.order - b.order || a.id.localeCompare(b.id);
  };
}
// This projection is the integration boundary for Stage 4 inheritance. SQL evaluates
// only canonically hydrated task values, never a competing raw-row interpretation.
export async function matchingTasks(
  db: QueryDatabase,
  service: TaskService,
  householdId: string,
  expression: FilterExpression[],
  context: FilterContext,
  options: { offset: number; limit: number; sort: ViewFields['sort']; includeArchived?: boolean },
) {
  const compiled = compileFilter(expression, context);
  if (compiled.warnings.length)
    return { items: [] as Task[], count: 0, nextOffset: null, warnings: compiled.warnings };
  let cursor = -1,
    count = 0;
  const selected: Task[] = [];
  const compare = taskComparator(options.sort),
    keep = options.offset + options.limit + 1;
  while (true) {
    const rows = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.householdId, householdId),
          isNull(tasks.trashedAt),
          options.includeArchived ? undefined : isNull(tasks.archivedAt),
          gt(tasks.order, cursor),
        ),
      )
      .orderBy(asc(tasks.order))
      .limit(256);
    if (!rows.length) break;
    cursor = rows.at(-1)!.order;
    const hydrated = await service.hydrate(db, rows, context.timezone, context.now);
    const projection = hydrated.map((task) => ({
      id: task.id,
      ...Object.fromEntries(
        filterFields
          .filter((field) => field !== 'description')
          .map((field) => [field, task[field as Exclude<typeof field, 'description'>]]),
      ),
      _descriptionText: plainText(task.description),
    }));
    const matches = await db.execute(
      sql`SELECT item->>'id' AS id FROM jsonb_array_elements(${JSON.stringify(projection)}::jsonb) item WHERE ${compiled.predicate}`,
    );
    const ids = new Set(matches.rows.map((r) => String(r.id)));
    count += ids.size;
    selected.push(...hydrated.filter((t) => ids.has(t.id)));
    selected.sort(compare);
    if (selected.length > keep) selected.length = keep;
    if (rows.length < 256) break;
  }
  return {
    items: selected
      .slice(options.offset, options.offset + options.limit)
      .map((t) => taskSchema.parse(t)),
    count,
    nextOffset: count > options.offset + options.limit ? options.offset + options.limit : null,
    warnings: compiled.warnings,
  };
}
