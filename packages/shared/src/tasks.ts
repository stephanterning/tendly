import { z } from 'zod';
export const columns = ['someday', 'within_year', 'within_month', 'todo', 'in_progress', 'done'] as const;
export const columnSchema = z.enum(columns);
export const sizes = ['XS', 'S', 'M', 'L', 'XL'] as const;
export const entityKinds = ['epic', 'place', 'resource', 'tag'] as const;
export const entityKindSchema = z.enum(entityKinds);
export const palette = [
  { id: 'red', hue: 25 }, { id: 'orange', hue: 55 }, { id: 'amber', hue: 85 },
  { id: 'green', hue: 145 }, { id: 'teal', hue: 180 }, { id: 'cyan', hue: 210 },
  { id: 'blue', hue: 255 }, { id: 'indigo', hue: 285 }, { id: 'purple', hue: 310 },
  { id: 'pink', hue: 345 }, { id: 'brown', hue: 65 }, { id: 'slate', hue: 250 },
] as const;
export const colorSchema = z.enum(['red', 'orange', 'amber', 'green', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink', 'brown', 'slate']);
import { iconNames } from './icons.js';
export { iconNames } from './icons.js';
export const iconSchema = z.enum(iconNames);
const ids = z.array(z.uuid()).max(100);
export const inheritedFields = ['epicId', 'high', 'startDate', 'deadlineDate', 'assignees'] as const;
export const inheritanceSchema = z.array(z.enum(inheritedFields));
export const taskFields = z.object({
  parentId: z.uuid().nullable(), inherit: inheritanceSchema,
  placeExclusions: ids, resourceExclusions: ids, tagExclusions: ids, blockers: ids, related: ids,
  title: z.string().trim().min(1).max(300), description: z.string().max(50_000),
  column: columnSchema, epicId: z.uuid().nullable(), high: z.boolean(),
  size: z.enum(sizes).nullable(), estimateMinutes: z.number().int().min(1).max(525600).nullable(),
  startDate: z.iso.date().nullable(), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  deadlineDate: z.iso.date().nullable(), deadlineTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  assignees: ids, places: ids, resources: ids, tags: ids,
});
export const taskCreateSchema = taskFields.partial().extend({ title: taskFields.shape.title, subtasks: z.array(taskFields.shape.title).max(100).optional(), confirmUnavailable: z.boolean().optional(), confirmDescendants: z.boolean().optional() }).strict();
export const taskChangesSchema = taskFields.partial().extend({ column: z.union([columnSchema, z.literal('reopen')]).optional() }).strict().refine(v => Object.keys(v).length > 0);
export const taskPatchSchema = z.object({ baseVersion: z.number().int().min(1), changes: taskChangesSchema, confirmUnavailable: z.boolean().optional(), confirmDescendants: z.boolean().optional() });
export const inheritedValuesSchema = taskFields.pick({ epicId: true, high: true, startDate: true, startTime: true, deadlineDate: true, deadlineTime: true, assignees: true, places: true, resources: true, tags: true }).extend({ assignees: z.array(z.uuid()), places: z.array(z.uuid()), resources: z.array(z.uuid()), tags: z.array(z.uuid()) });
export const taskLinkSchema = z.object({ id: z.uuid(), title: z.string(), column: columnSchema });
export const taskSchema = taskFields.extend({
  recurrenceTemplateId: z.uuid().nullable(),
  local: taskFields, inheritedValues: inheritedValuesSchema,
  places: z.array(z.uuid()), resources: z.array(z.uuid()), tags: z.array(z.uuid()), assignees: z.array(z.uuid()),
  ancestors: z.array(taskLinkSchema), relatedTasks: z.array(taskLinkSchema), children: z.array(taskLinkSchema),
  effectiveBlockers: z.array(z.object({ id: z.uuid(), title: z.string().nullable(), complete: z.boolean(), inherited: z.boolean() })),
  progress: z.object({ done: z.number().int(), total: z.number().int() }),
  unfinishedDescendants: z.number().int(), deadlineBeyondParent: z.boolean(),

  id: z.uuid(), householdId: z.uuid(), version: z.number().int(), order: z.number(),
  available: z.boolean(), overdue: z.boolean(), createdAt: z.string(), updatedAt: z.string(),
  completedAt: z.string().nullable(), completedBy: z.uuid().nullable(),
});
export const taskConflictSchema = z.object({ error: z.literal('task_conflict'), fields: z.array(z.string()), current: taskSchema });
export const entityFields = z.object({
  name: z.string().trim().min(1).max(100), description: z.string().max(5000),
  icon: iconSchema, color: colorSchema, archived: z.boolean(),
  latitude: z.number().min(-90).max(90).nullable(), longitude: z.number().min(-180).max(180).nullable(), radius: z.number().min(1).max(100000).nullable(),
});
export const entitySchema = entityFields.extend({ id: z.uuid(), kind: entityKindSchema, version: z.number().int(), order: z.number() });
export const entityCreateSchema = entityFields.partial().extend({ name: entityFields.shape.name, kind: entityKindSchema }).strict();
export const entityPatchSchema = z.object({ baseVersion: z.number().int().min(1), changes: entityFields.partial().strict() });
export const thresholdsSchema = z.tuple([z.number().int().positive(), z.number().int().positive(), z.number().int().positive(), z.number().int().positive()]).refine(v => v.every((n, i) => i === 0 || n > v[i - 1]!));
export const planningSettingsSchema = z.object({ version: z.number().int(), thresholds: thresholdsSchema });
export type Task = z.infer<typeof taskSchema>;
export type TaskFields = z.infer<typeof taskFields>;
export type TaskChanges = z.infer<typeof taskChangesSchema>;
export type Entity = z.infer<typeof entitySchema>;
export type EntityKind = z.infer<typeof entityKindSchema>;
export type TaskColumn = z.infer<typeof columnSchema>;

/** Merge one collection edge; callers provide the parent's already-resolved values. */
export function resolveCollection(parent: readonly string[], additions: readonly string[], exclusions: readonly string[]): string[] {
  return [...new Set([...parent.filter(id => !exclusions.includes(id)), ...additions])].sort();
}
