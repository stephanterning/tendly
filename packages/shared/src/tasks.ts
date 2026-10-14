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
export const iconNames = ['house', 'sprout', 'car', 'wrench', 'cat', 'box', 'fan', 'droplets', 'heart', 'shopping-bag', 'book-open', 'briefcase', 'map-pin', 'tag', 'hammer', 'bike', 'coffee', 'laptop', 'paintbrush', 'utensils', 'bed', 'tree-pine', 'sun', 'star'] as const;
export const iconSchema = z.enum(iconNames);
const ids = z.array(z.uuid()).max(100);
export const taskFields = z.object({
  title: z.string().trim().min(1).max(300), description: z.string().max(50_000),
  column: columnSchema, epicId: z.uuid().nullable(), high: z.boolean(),
  size: z.enum(sizes).nullable(), estimateMinutes: z.number().int().min(1).max(525600).nullable(),
  startDate: z.iso.date().nullable(), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  deadlineDate: z.iso.date().nullable(), deadlineTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  assignees: ids, places: ids, resources: ids, tags: ids,
});
export const taskCreateSchema = taskFields.partial().extend({ title: taskFields.shape.title, confirmUnavailable: z.boolean().optional() }).strict();
export const taskChangesSchema = taskFields.partial().extend({ column: z.union([columnSchema, z.literal('reopen')]).optional() }).strict().refine(v => Object.keys(v).length > 0);
export const taskPatchSchema = z.object({ baseVersion: z.number().int().min(1), changes: taskChangesSchema, confirmUnavailable: z.boolean().optional() });
export const taskSchema = taskFields.extend({
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
