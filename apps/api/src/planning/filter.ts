import { sql, type SQL } from 'drizzle-orm';
import { Temporal } from '@js-temporal/polyfill';
import { filterAstSchema, type FilterAst, type Task } from '@tendly/shared';
import type { QueryDatabase } from '../accounts/database.js';
export type FilterContext = { userId: string; currentPlace: string | null; timezone: string };
export function compileFilter(input: FilterAst, context: FilterContext): SQL {
  const ast = filterAstSchema.parse(input);
  function compile(node: FilterAst): SQL {
    if (node.type === 'group') {
      const children = node.children.map(compile);
      if (node.operator === 'not') return sql`NOT (${children[0]!})`;
      if (!children.length) return sql.raw(node.operator === 'and' ? 'TRUE' : 'FALSE');
      return sql`(${sql.join(children, sql.raw(node.operator === 'and' ? ' AND ' : ' OR '))})`;
    }
    // Field names and operators are validated allowlists; every operand remains a parameter.
    const raw = sql`(item -> ${node.field})`, text = sql`(item ->> ${node.field})`;
    if (node.operator === 'empty') return sql`(${raw} IS NULL OR ${raw} = 'null'::jsonb OR ${raw} = '[]'::jsonb OR ${raw} = '""'::jsonb)`;
    const values = (Array.isArray(node.value) ? node.value : [node.value]).map(value => value === '$user' ? context.userId : value === '$place' ? context.currentPlace : value === '$today' ? Temporal.Now.plainDateISO(context.timezone).toString() : value);
    if (values.includes(null)) return sql`FALSE`;
    const collection = ['assignees', 'places', 'resources', 'tags'].includes(node.field);
    if (collection) {
      const desired = sql`${JSON.stringify(values)}::jsonb`;
      if (node.operator === 'feasible') return sql`${desired} @> ${raw}`;
      if (node.operator === 'all') return sql`${raw} @> ${desired}`;
      const intersection = sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${raw}) e WHERE e.value IN (SELECT jsonb_array_elements_text(${desired})))`;
      return node.operator === 'compatible' ? sql`(${raw} = '[]'::jsonb OR ${intersection})` : intersection;
    }
    if (node.operator === 'contains') return sql`position(lower(${String(values[0])}) in lower(${text})) > 0`;
    if (node.operator === 'in' || node.operator === 'not_in') {
      const inside = values.length ? sql`${text} IN (${sql.join(values.map(v => sql`${String(v)}`), sql`, `)})` : sql`FALSE`;
      return node.operator === 'not_in' ? sql`NOT COALESCE((${inside}), FALSE)` : inside;
    }
    const left = node.field === 'estimateMinutes' ? sql`(${text})::numeric` : text;
    const right = node.field === 'estimateMinutes' ? sql`${Number(values[0])}::numeric` : sql`${String(values[0])}`;
    const operator = { eq: '=', ne: '<>', before: '<', after: '>', lte: '<=', gte: '>=' }[node.operator as 'eq'];
    return sql`COALESCE((${left} ${sql.raw(operator)} ${right}), FALSE)`;
  }
  return compile(ast);
}
export async function filterTasks(db: QueryDatabase, tasks: Task[], ast: FilterAst[], context: FilterContext) {
  const predicate = sql.join(ast.map(expression => sql`(${compileFilter(expression, context)})`), sql` AND `);
  // Filter the canonical effective snapshot, before sorting/pagination, through PostgreSQL.
  // No user-controlled SQL fragments or second client-side rule evaluator exist.
  const rows = await db.execute<{ item: Task }>(sql`SELECT item FROM jsonb_array_elements(${JSON.stringify(tasks)}::jsonb) AS snapshot(item) WHERE ${predicate}`);
  return rows.rows.map(row => row.item);
}
