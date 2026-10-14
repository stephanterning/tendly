import { z } from 'zod';
import { taskFields } from './tasks.js';
export const recurrenceSchema = z.object({ anchor: z.iso.date(), interval: z.number().int().min(1).max(1000), unit: z.enum(['days', 'weeks', 'months', 'years']), leadDays: z.number().int().min(0).max(365), enabled: z.boolean() }).strict();
export const templateNodeSchema = z.object({ sourceId: z.uuid(), value: taskFields, startOffset: z.number().int().nullable(), deadlineOffset: z.number().int().nullable() });
export const templateInputSchema = z.object({ name: z.string().trim().min(1).max(100), nodes: z.array(templateNodeSchema).min(1), recurrence: recurrenceSchema.nullable() });
export const templateSchema = templateInputSchema.extend({ id: z.uuid(), version: z.number().int() });
export const lifecycleSettingsSchema = z.object({ version: z.number().int(), archiveDays: z.number().int().min(1).max(3650).nullable(), trashDays: z.number().int().min(1).max(3650) });
export const lifecycleItemSchema = z.object({ id: z.uuid(), title: z.string(), version: z.number().int(), parentId: z.uuid().nullable(), archivedAt: z.string().nullable(), trashedAt: z.string().nullable() });
export type Recurrence = z.infer<typeof recurrenceSchema>;
export type TemplateNode = z.infer<typeof templateNodeSchema>;

export type Template = z.infer<typeof templateSchema>;
