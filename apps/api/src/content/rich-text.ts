import { z } from 'zod';
import { readRichText, type RichNode } from '@tendly/shared';
import { AccountError } from '../accounts/errors.js';
export function inspectRichText(value: string) {
  let root: RichNode;
  try { root = readRichText(value); } catch { throw new AccountError('invalid_rich_text'); }
  const mentions = new Set<string>(), images = new Set<string>();
  const stack = [{ node: root, depth: 0 }], text: string[] = [];
  let count = 0;
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (++count > 10000 || depth > 30 || !node || typeof node !== 'object' || !['doc', 'paragraph', 'text', 'heading', 'bulletList', 'orderedList', 'listItem', 'taskList', 'taskItem', 'blockquote', 'codeBlock', 'hardBreak', 'horizontalRule', 'image', 'mention'].includes(node.type)) throw new AccountError('invalid_rich_text');
    if (node.text !== undefined) { if (typeof node.text !== 'string') throw new AccountError('invalid_rich_text'); text.push(node.text); }
    if (node.type === 'mention') { if (typeof node.attrs?.id !== 'string') throw new AccountError('invalid_rich_text'); mentions.add(node.attrs.id); }
    if (node.type === 'image') { const match = typeof node.attrs?.src === 'string' && node.attrs.src.match(/^\/api\/v1\/households\/([0-9a-f-]{36})\/files\/([0-9a-f-]{36})$/i); if (!match || !z.uuid().safeParse(match[1]).success || !z.uuid().safeParse(match[2]).success) throw new AccountError('invalid_rich_text'); images.add(match[2]!); }
    if (node.attrs && Object.values(node.attrs).some(v => v !== null && !['string', 'boolean', 'number'].includes(typeof v))) throw new AccountError('invalid_rich_text');
    if (node.attrs && Object.keys(node.attrs).some(key => !['level', 'start', 'checked', 'language', 'src', 'alt', 'title', 'id', 'label', 'mentionSuggestionChar', 'width', 'height'].includes(key))) throw new AccountError('invalid_rich_text');
    if (node.marks !== undefined && !Array.isArray(node.marks)) throw new AccountError('invalid_rich_text');
    for (const mark of node.marks ?? []) {
      if (!mark || typeof mark !== 'object' || !['bold', 'italic', 'strike', 'underline', 'code', 'link'].includes(mark.type)) throw new AccountError('invalid_rich_text');
      if (mark.type === 'link' && (typeof mark.attrs?.href !== 'string' || !/^(https?:\/\/|mailto:)/i.test(mark.attrs.href))) throw new AccountError('invalid_rich_text');
      if (mark.attrs && Object.keys(mark.attrs).some(k => !['href', 'target', 'rel', 'class'].includes(k))) throw new AccountError('invalid_rich_text');
      if (mark.attrs?.target && !['_blank', '_self'].includes(String(mark.attrs.target))) throw new AccountError('invalid_rich_text');
    }
    if (node.content !== undefined && !Array.isArray(node.content)) throw new AccountError('invalid_rich_text');
    for (const child of node.content ?? []) stack.push({ node: child, depth: depth + 1 });
  }
  return { mentions: [...mentions], images: [...images], text: text.reverse().join(' ') };
}
