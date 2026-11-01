import { searchContent } from './search.js';
import { and, eq, desc, isNull } from 'drizzle-orm';
import { plainText, toDocument } from '@tendly/shared';
import type { Actor } from '../accounts/access.js';
import type { Database } from '../accounts/database.js';
import { users } from '../accounts/schema.js';
import { TaskService } from '../tasks/service.js';
import { tasks, taskActivities } from '../tasks/schema.js';
import { comments, attachments } from './schema.js';
import { AccountError } from '../accounts/errors.js';
import { validateReferences } from './references.js';
export class ContentService {
  readonly tasks: TaskService;
  constructor(readonly db: Database) {
    this.tasks = new TaskService(db);
  }
  async task(actor: Actor, householdId: string, taskId: string) {
    const home = await this.tasks.scope(this.db, actor, householdId);
    return this.tasks.get(this.db, householdId, taskId, home.timezone);
  }
  async listComments(actor: Actor, householdId: string, taskId: string, offset: number) {
    await this.task(actor, householdId, taskId);
    const rows = await this.db
      .select({ comment: comments, author: users.name })
      .from(comments)
      .leftJoin(users, eq(users.id, comments.authorId))
      .where(and(eq(comments.taskId, taskId), eq(comments.deleted, false)))
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .offset(offset)
      .limit(51);
    return {
      items: rows.slice(0, 50).map(({ comment: c, author }) => ({
        ...c,
        author: author ?? '—',
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      nextOffset: rows.length > 50 ? offset + 50 : null,
    };
  }
  async writeComment(
    actor: Actor,
    householdId: string,
    taskId: string,
    input: {
      body?: unknown;
      deleted?: boolean | undefined;
      baseVersion?: number | undefined;
    },
    id?: string,
  ) {
    return this.db.transaction(async (tx) => {
      const home = await this.tasks.scope(tx, actor, householdId, true);
      await this.tasks.get(tx, householdId, taskId, home.timezone);
      if (input.body) {
        if (!plainText(input.body).trim() && !JSON.stringify(input.body).includes('"image"'))
          throw new AccountError('empty_comment');
        if (!id) await validateReferences(tx, householdId, taskId, input.body);
      }
      let row;
      if (id) {
        const [old] = await tx
          .select()
          .from(comments)
          .where(and(eq(comments.id, id), eq(comments.taskId, taskId)))
          .for('update');
        if (!old) throw new AccountError('comment_not_found', 404);
        if (input.body) await validateReferences(tx, householdId, taskId, input.body, old.body);
        if (old.authorId !== actor.user.id) throw new AccountError('comment_author_required', 403);
        if (old.version !== input.baseVersion) throw new AccountError('comment_conflict', 409);
        [row] = await tx
          .update(comments)
          .set({
            ...(input.body ? { body: toDocument(input.body) } : {}),
            ...(input.deleted !== undefined ? { deleted: input.deleted } : {}),
            version: old.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(comments.id, id))
          .returning();
      } else {
        [row] = await tx
          .insert(comments)
          .values({
            taskId,
            authorId: actor.user.id,
            body: toDocument(input.body),
          })
          .returning();
      }
      return {
        ...row!,
        author: actor.user.name,
        createdAt: row!.createdAt.toISOString(),
        updatedAt: row!.updatedAt.toISOString(),
      };
    });
  }
  async activity(actor: Actor, householdId: string, taskId: string, offset: number) {
    await this.task(actor, householdId, taskId);
    const rows = await this.db
      .select({
        id: taskActivities.id,
        author: users.name,
        fields: taskActivities.fields,
        createdAt: taskActivities.createdAt,
      })
      .from(taskActivities)
      .leftJoin(users, eq(users.id, taskActivities.actorId))
      .where(eq(taskActivities.taskId, taskId))
      .orderBy(desc(taskActivities.createdAt), desc(taskActivities.id))
      .offset(offset)
      .limit(51);
    return {
      items: rows.slice(0, 50).map((r) => ({
        ...r,
        author: r.author ?? '—',
        createdAt: r.createdAt.toISOString(),
      })),
      nextOffset: rows.length > 50 ? offset + 50 : null,
    };
  }
  async files(actor: Actor, householdId: string, taskId: string) {
    await this.task(actor, householdId, taskId);
    return (
      await this.db
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.householdId, householdId),
            eq(attachments.taskId, taskId),
            eq(attachments.deleted, false),
          ),
        )
        .orderBy(desc(attachments.createdAt))
    ).map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }));
  }
  async search(
    actor: Actor,
    householdId: string,
    q: string,
    offset: number,
    filterIds: string[] = [],
  ) {
    return searchContent(this.db, actor, householdId, q, offset, filterIds);
  }
  async file(actor: Actor, householdId: string, id: string) {
    await this.tasks.scope(this.db, actor, householdId);
    const [file] = await this.db
      .select({ file: attachments })
      .from(attachments)
      .innerJoin(tasks, eq(tasks.id, attachments.taskId))
      .where(
        and(
          eq(attachments.id, id),
          eq(attachments.householdId, householdId),
          eq(tasks.householdId, householdId),
          eq(attachments.deleted, false),
          isNull(tasks.trashedAt),
        ),
      );
    if (!file) throw new AccountError('file_not_found', 404);
    return file.file;
  }
}
