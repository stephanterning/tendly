import { and, eq } from 'drizzle-orm';
import { toDocument, type ContentNode } from '@tendly/shared';
import type { QueryDatabase } from '../accounts/database.js';
import { memberships } from '../accounts/schema.js';
import { attachments } from './schema.js';
import { AccountError } from '../accounts/errors.js';
export async function validateReferences(
  db: QueryDatabase,
  householdId: string,
  taskId: string | undefined,
  value: unknown,
  previous?: unknown,
) {
  const priorMentions = new Set<string>();
  const collect = (n: ContentNode) => {
    if (n.type === 'mention') priorMentions.add(String(n.attrs?.id));
    for (const c of n.content ?? []) collect(c);
  };
  if (previous) collect(toDocument(previous));
  const visit = async (node: ContentNode): Promise<void> => {
    if (node.type === 'mention' && !priorMentions.has(String(node.attrs?.id))) {
      const [member] = await db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.householdId, householdId),
            eq(memberships.userId, String(node.attrs?.id)),
          ),
        );
      if (!member) throw new AccountError('invalid_task_reference');
    }
    for (const url of [
      node.type === 'image' ? node.attrs?.src : undefined,
      ...(node.marks ?? []).filter((m) => m.type === 'link').map((m) => m.attrs?.href),
    ]) {
      if (typeof url !== 'string' || !url.startsWith('/api/')) continue;
      const match =
        /^\/api\/v1\/households\/([0-9a-f-]{36})\/attachments\/([0-9a-f-]{36})\/(preview|download)$/.exec(
          url,
        );
      if (!match || match[1] !== householdId || !taskId)
        throw new AccountError('invalid_task_reference');
      const [file] = await db
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.id, match[2]!),
            eq(attachments.householdId, householdId),
            eq(attachments.taskId, taskId),
            eq(attachments.deleted, false),
          ),
        );
      if (!file || (node.type === 'image' && !file.preview))
        throw new AccountError('invalid_task_reference');
    }
    for (const child of node.content ?? []) await visit(child);
  };
  await visit(toDocument(value));
}
