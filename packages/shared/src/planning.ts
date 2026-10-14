import { z } from 'zod';
import { colorSchema, iconSchema, taskSchema } from './tasks.js';
const fields = ['column', 'size', 'epicId', 'high', 'available', 'overdue', 'startDate', 'deadlineDate', 'estimateMinutes', 'assignees', 'places', 'resources', 'tags', 'title'] as const;
export const predicateSchema = z.object({ type: z.literal('predicate'), field: z.enum(fields), operator: z.enum(['eq', 'ne', 'in', 'not_in', 'before', 'after', 'lte', 'gte', 'contains', 'any', 'all', 'feasible', 'compatible', 'empty']), value: z.union([z.string().max(300), z.number().finite(), z.boolean(), z.array(z.string().max(300)).max(100), z.null()]) }).strict();
export type FilterAst = z.infer<typeof predicateSchema> | { type: 'group'; operator: 'and' | 'or' | 'not'; children: FilterAst[] };
// A bounded schema rejects excessive nesting before recursive parsing can exhaust the stack.
function level(depth: number): z.ZodType<FilterAst> {
  return z.union([predicateSchema, z.object({ type: z.literal('group'), operator: z.enum(['and', 'or', 'not']), children: depth ? z.array(level(depth - 1)).max(30) : z.array(z.never()).max(0) }).strict()]);
}
const recursive = level(8);
export const filterAstSchema = recursive.superRefine((root, ctx) => {
  let count = 0;
  const walk = (node: FilterAst, depth: number) => {
    if (++count > 150 || depth > 8) { ctx.addIssue({ code: 'custom', message: 'filter_too_complex' }); return; }
    if (node.type === 'group') { if (node.operator === 'not' && node.children.length !== 1) ctx.addIssue({ code: 'custom', message: 'not_requires_one_child' }); node.children.forEach(n => walk(n, depth + 1)); return; }
    const collection = ['assignees', 'places', 'resources', 'tags'].includes(node.field);
    const boolean = ['high', 'available', 'overdue'].includes(node.field);
    const date = ['startDate', 'deadlineDate'].includes(node.field);
    const numeric = node.field === 'estimateMinutes';
    const operators = collection ? ['any', 'all', 'empty', ...(node.field === 'resources' ? ['feasible'] : []), ...(node.field === 'places' ? ['compatible'] : [])] : boolean ? ['eq', 'ne'] : date || numeric ? ['eq', 'ne', 'before', 'after', 'lte', 'gte', 'empty'] : ['eq', 'ne', 'in', 'not_in', 'empty', ...(node.field === 'title' ? ['contains'] : [])];
    if (!operators.includes(node.operator)) ctx.addIssue({ code: 'custom', message: 'invalid_filter_operator' });
    if (node.operator === 'empty') return;
    const values = Array.isArray(node.value) ? node.value : [node.value];
    const valid = values.every(v => boolean ? typeof v === 'boolean' : numeric ? typeof v === 'number' : date ? typeof v === 'string' && (v === '$today' || z.iso.date().safeParse(v).success) : collection || node.field === 'epicId' ? typeof v === 'string' && (z.uuid().safeParse(v).success || node.field === 'assignees' && v === '$user' || node.field === 'places' && v === '$place') : node.field === 'column' ? ['someday', 'within_year', 'within_month', 'todo', 'in_progress', 'done'].includes(String(v)) : node.field === 'size' ? ['XS', 'S', 'M', 'L', 'XL'].includes(String(v)) : typeof v === 'string');
    if (!valid || (!collection && !['in', 'not_in'].includes(node.operator) && Array.isArray(node.value)) || (['in', 'not_in'].includes(node.operator) && !Array.isArray(node.value))) ctx.addIssue({ code: 'custom', message: 'invalid_filter_value' });
  }; walk(root, 0);
}).meta({ id: 'FilterExpression' });
export const allFilter: FilterAst = { type: 'group', operator: 'and', children: [] };
export const nowFilter: FilterAst = { type: 'group', operator: 'and', children: [{ type: 'predicate', field: 'column', operator: 'in', value: ['within_month', 'todo', 'in_progress'] }, { type: 'predicate', field: 'available', operator: 'eq', value: true }] };
export const cardProperties = ['priority', 'size', 'deadline', 'progress', 'assignees', 'places', 'resources', 'tags', 'estimate'] as const;
export const viewDefinitionSchema = z.object({ presentation: z.enum(['board', 'list']), base: filterAstSchema, quickFilters: z.array(z.uuid()).max(30), sort: z.enum(['manual', 'deadline', 'priority', 'effort', 'created']), epicLanes: z.boolean(), showEmptyLanes: z.boolean(), subtasks: z.boolean(), cardProperties: z.array(z.enum(cardProperties)) }).strict();
export type ViewDefinition = z.infer<typeof viewDefinitionSchema>;
export const defaultView = (now: boolean): ViewDefinition => ({ presentation: now ? 'list' : 'board', base: now ? nowFilter : allFilter, quickFilters: [], sort: 'manual', epicLanes: false, showEmptyLanes: false, subtasks: now, cardProperties: ['priority', 'size', 'deadline', 'progress', 'assignees'] });
export const documentFields = z.object({ name: z.string().trim().min(1).max(100), icon: iconSchema, color: colorSchema });
export const filterInput = documentFields.extend({ definition: filterAstSchema });
export const viewInput = documentFields.extend({ definition: viewDefinitionSchema });
const metadata = { id: z.uuid(), version: z.number().int(), createdBy: z.uuid().nullable(), builtin: z.enum(['now', 'board']).nullable() };
export const filterDocumentSchema = filterInput.extend(metadata);
export const viewDocumentSchema = viewInput.extend(metadata);
export const personalViewSchema = z.object({ version: z.number().int(), activeFilters: z.array(z.uuid()).max(30), favorite: z.boolean(), currentPlace: z.uuid().nullable() });
export const planningLibrarySchema = z.object({ filters: z.array(filterDocumentSchema), views: z.array(viewDocumentSchema), personal: z.record(z.string(), personalViewSchema) });
export const viewResultsSchema = z.object({ items: z.array(taskSchema), count: z.number().int(), nextOffset: z.number().nullable(), missingCurrentPlace: z.boolean() });
export type SavedFilter = z.infer<typeof filterDocumentSchema>;
export type SavedView = z.infer<typeof viewDocumentSchema>;
export type PersonalView = z.infer<typeof personalViewSchema>;
