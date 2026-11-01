import { sql, type SQL } from 'drizzle-orm';
import { Temporal } from '@js-temporal/polyfill';
import { parseExpression, type FilterExpression, type FilterValue } from '@tendly/shared';
export type FilterContext = {
  userId: string;
  currentPlaceId: string | null;
  timezone: string;
  now: number;
};
export function compileFilter(
  input: unknown[],
  context: FilterContext,
): { predicate: SQL; warnings: string[] } {
  const expressions = input.map(parseExpression);
  const warnings = new Set<string>();
  const resolve = (value: FilterValue): Exclude<FilterValue, object> | string[] => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    if (value.token === 'CURRENT_USER') return [context.userId];
    if (value.token === 'CURRENT_PLACE') {
      if (!context.currentPlaceId) warnings.add('choose_current_place');
      return context.currentPlaceId ? [context.currentPlaceId] : [];
    }
    return Temporal.Instant.fromEpochMilliseconds(context.now)
      .toZonedDateTimeISO(context.timezone)
      .toPlainDate()
      .add({ days: value.offsetDays ?? 0 })
      .toString();
  };
  const visit = (node: FilterExpression): SQL => {
    if (node.type === 'group') {
      const children = node.children.map(visit);
      if (node.operator === 'NOT') return sql`NOT (${children[0]})`;
      if (!children.length) return node.operator === 'AND' ? sql`true` : sql`false`;
      return sql`(${sql.join(children, node.operator === 'AND' ? sql` AND ` : sql` OR `)})`;
    }
    const { field, operator } = node;
    const value = resolve(node.value);
    const set = ['assignees', 'places', 'resources', 'tags'].includes(field);
    const key = field === 'description' ? '_descriptionText' : field;
    const raw = sql`item->>${key}`;
    const array = sql`COALESCE(item->${key}, '[]'::jsonb)`;
    const empty = set
      ? sql`jsonb_array_length(${array}) = 0`
      : sql`(${raw} IS NULL OR ${raw} = '')`;
    if (operator === 'EMPTY') return empty;
    if (operator === 'NOT_EMPTY') return sql`NOT (${empty})`;
    const operand =
      typeof value === 'boolean'
        ? sql`(${raw})::boolean`
        : typeof value === 'number'
          ? sql`(${raw})::numeric`
          : ['createdAt', 'completedAt'].includes(field)
            ? sql`((${raw})::timestamptz AT TIME ZONE ${context.timezone})::date::text`
            : raw;
    if (operator === 'EQ') return sql`${operand} IS NOT DISTINCT FROM ${value}`;
    if (operator === 'NE') return sql`${operand} IS DISTINCT FROM ${value}`;
    if (operator === 'CONTAINS')
      return sql`strpos(lower(COALESCE(${raw}, '')), lower(${value})) > 0`;
    if (operator === 'LT') return sql`COALESCE(${operand} < ${value}, false)`;
    if (operator === 'LTE') return sql`COALESCE(${operand} <= ${value}, false)`;
    if (operator === 'GT') return sql`COALESCE(${operand} > ${value}, false)`;
    if (operator === 'GTE') return sql`COALESCE(${operand} >= ${value}, false)`;
    const values = Array.isArray(value) ? value : [];
    if (operator === 'ALL') return sql`${array} @> ${JSON.stringify(values)}::jsonb`;
    if (operator === 'FEASIBLE') return sql`${array} <@ ${JSON.stringify(values)}::jsonb`;
    const overlap = set
      ? sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${array}) v WHERE v IN (SELECT jsonb_array_elements_text(${JSON.stringify(values)}::jsonb)))`
      : sql`COALESCE(${raw} IN (SELECT jsonb_array_elements_text(${JSON.stringify(values)}::jsonb)), false)`;
    if (operator === 'COMPATIBLE') return sql`(${empty} OR ${overlap})`;
    return operator === 'NOT_IN' ? sql`NOT (${overlap})` : overlap;
  };
  const predicate = sql`(${sql.join(expressions.map(visit), sql` AND `)})`;
  // Missing context is not false that NOT can accidentally turn into a broad match.
  return { predicate: warnings.size ? sql`false` : predicate, warnings: [...warnings] };
}
