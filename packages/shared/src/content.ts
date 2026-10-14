import { z } from 'zod';
export type RichNode = { type: string; text?: string; attrs?: Record<string, string | number | boolean | null>; content?: RichNode[]; marks?: { type: string; attrs?: Record<string, string | boolean | null> }[] };
export function readRichText(value: string): RichNode {
  if (!value.startsWith('{"type":"doc"')) return { type: 'doc', content: value ? [{ type: 'paragraph', content: [{ type: 'text', text: value }] }] : [{ type: 'paragraph' }] };
  return JSON.parse(value) as RichNode;
}
export const commentSchema = z.object({ id: z.uuid(), taskId: z.uuid(), authorId: z.uuid().nullable(), author: z.string(), body: z.string(), version: z.number().int(), createdAt: z.string(), updatedAt: z.string() });
export const fileSchema = z.object({ id: z.uuid(), name: z.string(), mime: z.string(), size: z.number().int(), commentId: z.uuid().nullable(), createdAt: z.string() });
export const activitySchema = z.object({ id: z.uuid(), actor: z.string().nullable(), fields: z.array(z.string()), createdAt: z.string() });
export const taskContentSchema = z.object({ comments: z.array(commentSchema), files: z.array(fileSchema), activity: z.array(activitySchema) });
