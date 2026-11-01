import { expect, it } from 'vitest';
import { expressionSchema, type FilterExpression } from './views.js';
it('rejects mismatched types, operators, dynamic tokens and excessive nesting at the API boundary', () => {
  const base = { type: 'predicate', field: 'column', operator: 'IN', value: ['todo'] };
  expect(expressionSchema.safeParse(base).success).toBe(true);
  for (const change of [
    { value: ['waiting'] },
    { operator: 'CONTAINS' },
    { field: 'high' },
    { field: 'assignees', value: { token: 'CURRENT_PLACE' } },
    { field: 'startDate', operator: 'EQ', value: '2026-02-30' },
    { field: 'title; DROP TABLE tasks' },
  ])
    expect(expressionSchema.safeParse({ ...base, ...change }).success).toBe(false);
  expect(expressionSchema.safeParse({ type: 'group', operator: 'NOT', children: [] }).success).toBe(
    false,
  );
  let tree: FilterExpression = { type: 'predicate', field: 'high', operator: 'EQ', value: true };
  for (let i = 0; i < 12; i++) tree = { type: 'group', operator: 'NOT', children: [tree] };
  expect(expressionSchema.safeParse(tree).success).toBe(false);
});
it('accepts safe literal text and portable nested dynamic expressions', () => {
  const expression = {
    type: 'group',
    operator: 'AND',
    children: [
      {
        type: 'predicate',
        field: 'deadlineDate',
        operator: 'LTE',
        value: { token: 'TODAY', offsetDays: 7 },
      },
      {
        type: 'group',
        operator: 'OR',
        children: [
          {
            type: 'predicate',
            field: 'assignees',
            operator: 'IN',
            value: { token: 'CURRENT_USER' },
          },
          { type: 'predicate', field: 'title', operator: 'CONTAINS', value: "' OR true --" },
        ],
      },
    ],
  };
  expect(expressionSchema.parse(JSON.parse(JSON.stringify(expression)))).toEqual(expression);
});
