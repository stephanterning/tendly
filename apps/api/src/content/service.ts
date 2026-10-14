import { inspectRichText } from './rich-text.js';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, asc, eq } from 'drizzle-orm';
import type { Database } from '../accounts/database.js';
import type { Actor } from '../accounts/access.js';
import { users } from '../accounts/schema.js';
import { AccountError } from '../accounts/errors.js';
import { TaskService } from '../tasks/service.js';
import { taskActivities } from '../tasks/schema.js';
import { comments, files } from './schema.js';
export class ContentService {
  readonly tasks: TaskService;
  constructor(readonly db: Database, readonly directory: string) { this.tasks = new TaskService(db); }
  async list(actor: Actor, householdId: string, taskId: string) {
    return this.db.transaction(async tx => {
      const household = await this.tasks.scope(tx, actor, householdId);
      await this.tasks.get(tx, householdId, taskId, household.timezone);
      const commentRows = await tx.select({ comment: comments, author: users.name }).from(comments).leftJoin(users, eq(users.id, comments.authorId)).where(and(eq(comments.householdId, householdId), eq(comments.taskId, taskId))).orderBy(asc(comments.createdAt));
      const activity = await tx.select({ activity: taskActivities, actor: users.name }).from(taskActivities).leftJoin(users, eq(users.id, taskActivities.actorId)).where(eq(taskActivities.taskId, taskId)).orderBy(asc(taskActivities.createdAt));
      const fileRows = await tx.select().from(files).where(and(eq(files.householdId, householdId), eq(files.taskId, taskId)));
      return { comments: commentRows.map(({ comment: c, author }) => ({ ...c, author: author ?? '—', createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() })), files: fileRows.map(f => ({ ...f, createdAt: f.createdAt.toISOString() })), activity: activity.map(({ activity: a, actor }) => ({ ...a, actor, createdAt: a.createdAt.toISOString() })) };
    }, { isolationLevel: 'repeatable read' });
  }
  async comment(actor: Actor, householdId: string, taskId: string, body: string, id?: string, version?: number) {
    await this.db.transaction(async tx => {
      const household = await this.tasks.scope(tx, actor, householdId, true);
      await this.tasks.get(tx, householdId, taskId, household.timezone);
      await this.tasks.validateContent(tx, householdId, body);
      const content = inspectRichText(body);
      if (!content.text.trim() && !content.images.length && !content.mentions.length) throw new AccountError('empty_comment');
      if (id) {
        const [old] = await tx.select().from(comments).where(and(eq(comments.id, id), eq(comments.householdId, householdId), eq(comments.taskId, taskId)));
        if (!old) throw new AccountError('comment_not_found', 404);
        if (old.authorId !== actor.user.id) throw new AccountError('comment_author_required', 403);
        if (old.version !== version) throw new AccountError('planning_conflict', 409);
        await tx.update(comments).set({ body, version: old.version + 1, updatedAt: new Date() }).where(eq(comments.id, id));
      } else await tx.insert(comments).values({ taskId, householdId, authorId: actor.user.id, body });
    });
  }
  async removeComment(actor: Actor, householdId: string, id: string, version: number) {
    await this.db.transaction(async tx => {
      await this.tasks.scope(tx, actor, householdId, true);
      const [old] = await tx.select().from(comments).where(and(eq(comments.id, id), eq(comments.householdId, householdId)));
      if (!old) throw new AccountError('comment_not_found', 404);
      if (old.authorId !== actor.user.id) throw new AccountError('comment_author_required', 403);
      if (old.version !== version) throw new AccountError('planning_conflict', 409);
      await tx.delete(comments).where(eq(comments.id, id));
    });
  }
  async upload(actor: Actor, householdId: string, taskId: string, input: { name: string; base64: string; commentId?: string | null | undefined }) {
    const bytes = Buffer.from(input.base64, 'base64');
    if (!bytes.length || bytes.length > 16 * 1024 * 1024 || bytes.toString('base64') !== input.base64) throw new AccountError('invalid_file');
    const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png' : bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? 'image/jpeg' : ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString()) ? 'image/gif' : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : 'application/octet-stream';
    const id = randomUUID();
    try {
      return await this.db.transaction(async tx => {
        const household = await this.tasks.scope(tx, actor, householdId, true);
        await this.tasks.get(tx, householdId, taskId, household.timezone);
        if (input.commentId) {
          const [comment] = await tx.select().from(comments).where(and(eq(comments.id, input.commentId), eq(comments.taskId, taskId), eq(comments.householdId, householdId)));
          if (!comment || comment.authorId !== actor.user.id) throw new AccountError('comment_author_required', 403);
        }
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        await writeFile(join(this.directory, id), bytes, { flag: 'wx', mode: 0o600 });
        const [file] = await tx.insert(files).values({ id, householdId, taskId, name: input.name, mime, size: bytes.length, commentId: input.commentId ?? null }).returning();
        return { ...file!, createdAt: file!.createdAt.toISOString() };
      });
    } catch (error) { await unlink(join(this.directory, id)).catch(() => {}); throw error; }
  }
  async download(actor: Actor, householdId: string, id: string) {
    await this.tasks.scope(this.db, actor, householdId);
    const [file] = await this.db.select().from(files).where(and(eq(files.id, id), eq(files.householdId, householdId)));
    if (!file) throw new AccountError('file_not_found', 404);
    try { return { file, bytes: await readFile(join(this.directory, file.id)) }; } catch { throw new AccountError('file_not_found', 404); }
  }
  async removeFile(actor: Actor, householdId: string, id: string) {
    await this.db.transaction(async tx => {
      await this.tasks.scope(tx, actor, householdId, true);
      const [file] = await tx.select().from(files).where(and(eq(files.id, id), eq(files.householdId, householdId)));
      if (!file) throw new AccountError('file_not_found', 404);
      await tx.delete(files).where(eq(files.id, id));
    });
    // Metadata commits first. A crash may leave an orphan file, never a live record pointing at deleted bytes.
    await unlink(join(this.directory, id)).catch(() => {});
  }
}
