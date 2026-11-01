import { z } from 'zod';
export type ContentNode = {
  type: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | null>;
  marks?: { type: string; attrs?: Record<string, string | null> }[];
  content?: ContentNode[];
};
export type Document = { type: 'doc'; content: ContentNode[] };
const blocks = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'codeBlock',
  'horizontalRule',
  'hardBreak',
  'text',
  'image',
  'mention',
]);
export function safeLink(value: string) {
  return (
    /^\/api\/v1\/households\/[0-9a-f-]{36}\/attachments\/[0-9a-f-]{36}\/download$/.test(value) ||
    (/^(https?:\/\/|mailto:)/i.test(value) && !Array.from(value).some((c) => c.charCodeAt(0) <= 32))
  );
}
export function validDocument(value: unknown): value is Document {
  let count = 0,
    length = 0;
  const visit = (raw: unknown, depth: number): boolean => {
    if (++count > 5000 || depth > 24 || !raw || typeof raw !== 'object' || Array.isArray(raw))
      return false;
    const n = raw as ContentNode;
    if (!blocks.has(n.type) && !(depth === 0 && n.type === 'doc')) return false;
    if (Object.keys(n).some((k) => !['type', 'text', 'attrs', 'marks', 'content'].includes(k)))
      return false;
    if (n.text !== undefined && (n.type !== 'text' || typeof n.text !== 'string')) return false;
    length += n.text?.length ?? 0;
    if (length > 50_000) return false;
    const allowed: Record<string, string[]> = {
      heading: ['level'],
      orderedList: ['start', 'type'],
      taskItem: ['checked'],
      codeBlock: ['language'],
      mention: ['id', 'label', 'mentionSuggestionChar'],
      image: ['src', 'alt', 'title', 'width', 'height'],
    };
    if (n.attrs) {
      if (typeof n.attrs !== 'object' || Array.isArray(n.attrs)) return false;
      if (
        Object.entries(n.attrs).some(
          ([k, v]) =>
            !(allowed[n.type] ?? []).includes(k) ||
            (v !== null && !['string', 'number', 'boolean'].includes(typeof v)),
        )
      )
        return false;
    }
    if (n.type === 'heading' && ![1, 2, 3, 4, 5, 6].includes(Number(n.attrs?.level))) return false;
    if (n.type === 'mention' && !z.uuid().safeParse(n.attrs?.id).success) return false;
    if (
      n.type === 'image' &&
      !/^\/api\/v1\/households\/[0-9a-f-]{36}\/attachments\/[0-9a-f-]{36}\/preview$/.test(
        String(n.attrs?.src),
      )
    )
      return false;
    if (
      n.marks &&
      (!Array.isArray(n.marks) ||
        n.marks.some((m) => {
          if (
            !m ||
            !['bold', 'italic', 'strike', 'code', 'underline', 'link'].includes(m.type) ||
            Object.keys(m).some((k) => !['type', 'attrs'].includes(k))
          )
            return true;
          if (m.type === 'link' && !safeLink(String(m.attrs?.href))) return true;
          return (
            m.attrs &&
            Object.entries(m.attrs).some(
              ([k, v]) =>
                m.type !== 'link' ||
                !['href', 'target', 'rel', 'class', 'title'].includes(k) ||
                (v !== null && typeof v !== 'string'),
            )
          );
        }))
    )
      return false;
    if (n.content !== undefined && !Array.isArray(n.content)) return false;
    const inline = ['text', 'hardBreak', 'mention'];
    const block = [
      'paragraph',
      'heading',
      'blockquote',
      'bulletList',
      'orderedList',
      'taskList',
      'codeBlock',
      'horizontalRule',
      'image',
    ];
    const children: Record<string, string[]> = {
      doc: block,
      paragraph: inline,
      heading: inline,
      blockquote: block,
      bulletList: ['listItem'],
      orderedList: ['listItem'],
      listItem: block,
      taskList: ['taskItem'],
      taskItem: block,
      codeBlock: ['text'],
    };
    if (n.type === 'text' && !n.text) return false;
    if (
      n.content?.some(
        (child) => !child || typeof child !== 'object' || !children[n.type]?.includes(child.type),
      )
    )
      return false;
    return (
      !n.content ||
      (Array.isArray(n.content) && n.content.every((child) => visit(child, depth + 1)))
    );
  };
  return (
    !!value &&
    typeof value === 'object' &&
    (value as Document).type === 'doc' &&
    Array.isArray((value as Document).content) &&
    visit(value, 0)
  );
}
export const documentSchema = z
  .object({
    type: z.literal('doc'),
    content: z.array(
      z
        .object({
          type: z.string(),
          text: z.string().optional(),
          attrs: z
            .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
            .optional(),
          marks: z
            .array(
              z
                .object({
                  type: z.string(),
                  attrs: z.record(z.string(), z.string().nullable()).optional(),
                })
                .strict(),
            )
            .optional(),
          content: z.array(z.unknown()).optional(),
        })
        .strict(),
    ),
  })
  .strict()
  .refine((v): boolean => validDocument(v), 'Invalid rich content');
export const descriptionSchema = z.union([z.string().max(50_000), documentSchema]);
export function toDocument(value: unknown): Document {
  if (typeof value === 'string')
    return {
      type: 'doc',
      content: value.split('\n').map((text) => ({
        type: 'paragraph',
        ...(text ? { content: [{ type: 'text', text }] } : {}),
      })),
    };
  return value as Document;
}
export function plainText(value: unknown): string {
  if (typeof value === 'string') return value;
  const walk = (n: ContentNode): string =>
    n.text ??
    (n.type === 'hardBreak'
      ? '\n'
      : n.type === 'mention'
        ? '@' + String(n.attrs?.label ?? '')
        : (n.content ?? [])
            .map(walk)
            .join(['paragraph', 'heading', 'codeBlock'].includes(n.type) ? '' : '\n'));
  return walk(toDocument(value));
}
export const commentSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  authorId: z.uuid().nullable(),
  author: z.string(),
  body: documentSchema,
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deleted: z.boolean(),
});
export const commentWriteSchema = z.object({ body: documentSchema });
export const commentPatchSchema = z
  .object({
    baseVersion: z.number().int().positive(),
    body: documentSchema.optional(),
    deleted: z.boolean().optional(),
  })
  .refine((v) => v.body !== undefined || v.deleted !== undefined);
export const attachmentSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  name: z.string(),
  mime: z.string(),
  size: z.number(),
  preview: z.boolean(),
  createdAt: z.string(),
  version: z.number().int(),
  deleted: z.boolean(),
});
export const activitySchema = z.object({
  id: z.uuid(),
  author: z.string(),
  fields: z.array(z.string()),
  createdAt: z.string(),
});
export const searchHitSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['task', 'comment', 'epic', 'tag']),
  title: z.string(),
  snippet: z.string(),
  taskId: z.uuid().nullable(),
});
