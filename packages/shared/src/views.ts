import { z } from 'zod';
import { columnSchema, colorSchema, iconSchema, sizes, taskSchema } from './tasks.js';

export const filterFields = [
  'column',
  'size',
  'available',
  'overdue',
  'high',
  'epicId',
  'assignees',
  'places',
  'resources',
  'tags',
  'title',
  'description',
  'startDate',
  'deadlineDate',
  'estimateMinutes',
  'createdAt',
  'completedAt',
] as const;
export const filterOperators = [
  'EQ',
  'NE',
  'IN',
  'NOT_IN',
  'ALL',
  'EMPTY',
  'NOT_EMPTY',
  'CONTAINS',
  'LT',
  'LTE',
  'GT',
  'GTE',
  'COMPATIBLE',
  'FEASIBLE',
] as const;
export type FilterField = (typeof filterFields)[number];
export type FilterOperator = (typeof filterOperators)[number];
export type DynamicValue = {
  token: 'CURRENT_USER' | 'CURRENT_PLACE' | 'TODAY';
  offsetDays?: number;
};
export type FilterValue = string | number | boolean | null | string[] | DynamicValue;
export type FilterExpression =
  | { type: 'group'; operator: 'AND' | 'OR' | 'NOT'; children: FilterExpression[] }
  | { type: 'predicate'; field: FilterField; operator: FilterOperator; value: FilterValue };
export const operatorsFor = (field: FilterField): FilterOperator[] => {
  if (['available', 'overdue', 'high'].includes(field)) return ['EQ', 'NE'];
  if (['title', 'description'].includes(field))
    return ['CONTAINS', 'EQ', 'NE', 'EMPTY', 'NOT_EMPTY'];
  if (['startDate', 'deadlineDate', 'createdAt', 'completedAt', 'estimateMinutes'].includes(field))
    return ['EQ', 'NE', 'LT', 'LTE', 'GT', 'GTE', 'EMPTY', 'NOT_EMPTY'];
  if (field === 'places') return ['IN', 'NOT_IN', 'ALL', 'COMPATIBLE', 'EMPTY', 'NOT_EMPTY'];
  if (field === 'resources') return ['IN', 'NOT_IN', 'ALL', 'FEASIBLE', 'EMPTY', 'NOT_EMPTY'];
  return [
    'IN',
    'NOT_IN',
    ...(['assignees', 'tags'].includes(field) ? ['ALL' as const] : []),
    'EMPTY',
    'NOT_EMPTY',
  ];
};
const dynamicSchema = z
  .object({
    token: z.enum(['CURRENT_USER', 'CURRENT_PLACE', 'TODAY']),
    offsetDays: z.number().int().min(-36500).max(36500).optional(),
  })
  .strict();
const nodeSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('group'),
      operator: z.enum(['AND', 'OR', 'NOT']),
      children: z.array(z.unknown()).max(50),
    })
    .strict(),
  z
    .object({
      type: z.literal('predicate'),
      field: z.enum(filterFields),
      operator: z.enum(filterOperators),
      value: z.union([
        z.string().max(500),
        z.number().finite(),
        z.boolean(),
        z.null(),
        z.array(z.string().max(100)).max(100),
        dynamicSchema,
      ]),
    })
    .strict(),
]);
function validTree(input: unknown) {
  let count = 0;
  const visit = (value: unknown, depth: number): boolean => {
    if (++count > 150 || depth > 10) return false;
    const parsed = nodeSchema.safeParse(value);
    if (!parsed.success) return false;
    const n = parsed.data;
    if (n.type === 'group')
      return (
        (n.operator !== 'NOT' || n.children.length === 1) &&
        n.children.every((c) => visit(c, depth + 1))
      );
    if (!operatorsFor(n.field).includes(n.operator)) return false;
    if (['EMPTY', 'NOT_EMPTY'].includes(n.operator)) return n.value === null;
    if (['available', 'overdue', 'high'].includes(n.field)) return typeof n.value === 'boolean';
    if (['title', 'description'].includes(n.field)) return typeof n.value === 'string';
    if (n.field === 'estimateMinutes')
      return typeof n.value === 'number' && n.value >= 0 && n.value <= 525600;
    if (['startDate', 'deadlineDate', 'createdAt', 'completedAt'].includes(n.field))
      return (
        z.iso.date().safeParse(n.value).success ||
        (!!n.value &&
          !Array.isArray(n.value) &&
          typeof n.value === 'object' &&
          n.value.token === 'TODAY')
      );
    if (n.value && !Array.isArray(n.value) && typeof n.value === 'object')
      return (
        n.value.offsetDays === undefined &&
        ((n.field === 'assignees' && n.value.token === 'CURRENT_USER') ||
          (n.field === 'places' && n.value.token === 'CURRENT_PLACE'))
      );
    if (!Array.isArray(n.value)) return false;
    const schema =
      n.field === 'column' ? columnSchema : n.field === 'size' ? z.enum(sizes) : z.uuid();
    return n.value.every((v) => schema.safeParse(v).success);
  };
  return visit(input, 0);
}
// A finite documented envelope plus recursive validation avoids unbounded parser work.
export const expressionSchema = nodeSchema.refine(
  (v): boolean => validTree(v),
  'Invalid filter expression',
);
export const parseExpression = (value: unknown) =>
  expressionSchema.parse(value) as FilterExpression;
export const allTasks: FilterExpression = { type: 'group', operator: 'AND', children: [] };
export const nowExpression: FilterExpression = {
  type: 'group',
  operator: 'AND',
  children: [
    {
      type: 'predicate',
      field: 'column',
      operator: 'IN',
      value: ['within_month', 'todo', 'in_progress'],
    },
    { type: 'predicate', field: 'available', operator: 'EQ', value: true },
  ],
};
export const filterFieldsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  icon: iconSchema,
  color: colorSchema,
  expression: expressionSchema,
});
export const savedFilterSchema = filterFieldsSchema.extend({
  id: z.uuid(),
  creatorId: z.uuid().nullable(),
  creator: z.string(),
  builtin: z.string().nullable(),
  version: z.number().int(),
  deleted: z.boolean(),
});
export const filterVersionSchema = z.object({
  version: z.number().int(),
  author: z.string(),
  createdAt: z.string(),
  snapshot: filterFieldsSchema,
});
export const cardProperties = [
  'epic',
  'size',
  'high',
  'deadline',
  'assignees',
  'places',
  'resources',
  'tags',
  'estimate',
  'availability',
] as const;
export const sortKeys = ['manual', 'deadline', 'high', 'effort', 'created'] as const;
export const viewFieldsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  icon: iconSchema,
  color: colorSchema,
  presentation: z.enum(['list', 'board']),
  expression: expressionSchema,
  quickFilters: z
    .array(z.uuid())
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate quick filter'),
  sort: z.enum(sortKeys),
  epicLanes: z.boolean(),
  showEmptyLanes: z.boolean(),
  cardProperties: z
    .array(z.enum(cardProperties))
    .max(cardProperties.length)
    .refine((keys) => new Set(keys).size === keys.length, 'Duplicate card property'),
});
export const savedViewSchema = viewFieldsSchema.extend({
  id: z.uuid(),
  creatorId: z.uuid().nullable(),
  creator: z.string(),
  builtin: z.enum(['now', 'board']).nullable(),
  version: z.number().int(),
  deleted: z.boolean(),
});
export const viewStateSchema = z.object({
  version: z.number().int(),
  favorite: z.boolean(),
  activeFilters: z.array(z.uuid()),
});
export const viewContextSchema = z.object({
  version: z.number().int(),
  currentPlaceId: z.uuid().nullable(),
});
export const viewCatalogSchema = z.object({
  filters: z.array(savedFilterSchema),
  views: z.array(savedViewSchema),
  states: z.record(z.uuid(), viewStateSchema),
  context: viewContextSchema,
});
export const taskQuerySchema = z.object({
  viewId: z.uuid().optional(),
  replaceFilterId: z.uuid().optional(),
  expression: expressionSchema.optional(),
  filterIds: z.array(z.uuid()).max(50).optional(),
  offset: z.number().int().min(0).max(100000).default(0),
  limit: z.number().int().min(1).max(100).default(50),
});
export const taskQueryResultSchema = z.object({
  items: z.array(taskSchema),
  count: z.number().int(),
  nextOffset: z.number().nullable(),
  orderVersion: z.number().int(),
  warnings: z.array(z.string()),
});
export const moveTaskSchema = z
  .object({
    baseVersion: z.number().int().positive(),
    orderVersion: z.number().int().min(0),
    beforeId: z.uuid().nullable().optional(),
    afterId: z.uuid().nullable().optional(),
    column: columnSchema.optional(),
    epicId: z.uuid().nullable().optional(),
    confirmUnavailable: z.boolean().optional(),
  })
  .strict()
  .refine((v) => !(v.beforeId !== undefined && v.afterId !== undefined));
export const moveTaskResultSchema = z.object({
  task: taskSchema,
  orderVersion: z.number().int(),
  inverse: z.object({
    beforeId: z.uuid().nullable(),
    column: columnSchema,
    epicId: z.uuid().nullable(),
  }),
});
export type SavedFilter = z.infer<typeof savedFilterSchema>;
export type SavedView = z.infer<typeof savedViewSchema>;
export type ViewFields = z.infer<typeof viewFieldsSchema>;
export type ViewCatalog = z.infer<typeof viewCatalogSchema>;
export type TaskQuery = z.infer<typeof taskQuerySchema>;
