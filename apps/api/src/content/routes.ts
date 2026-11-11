import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  commentSchema,
  commentWriteSchema,
  commentPatchSchema,
  attachmentSchema,
  activitySchema,
  searchHitSchema,
} from '@tendly/shared';
import { ContentService } from './service.js';
import { FileStore } from './files.js';
import type { AccountService } from '../accounts/service.js';
import { signedIn } from '../accounts/access.js';
import { AccountError } from '../accounts/errors.js';
const home = z.object({ householdId: z.uuid() });
const task = home.extend({ taskId: z.uuid() });
const paging = z.object({ offset: z.coerce.number().int().min(0).default(0) });
export async function registerContentRoutes(
  server: FastifyInstance,
  accounts: AccountService,
  root: string,
  limit: number,
) {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const service = new ContentService(accounts.db),
    files = new FileStore(service, root);
  await app.register(multipart, {
    limits: { fileSize: limit, files: 1, fields: 0, parts: 1 },
  });
  let cleaning = false;
  const sweep = () => {
    if (cleaning) return;
    cleaning = true;
    void files
      .cleanupOrphans()
      .catch(() => app.log.error('Attachment cleanup failed'))
      .finally(() => {
        cleaning = false;
      });
  };
  const cleanup = setInterval(sweep, 3600_000);
  cleanup.unref();
  app.addHook('onClose', async () => {
    clearInterval(cleanup);
  });
  const cookie = accounts.origin.startsWith('https:') ? '__Host-tendly' : 'tendly_session';
  const actor = async (r: FastifyRequest) => {
    const a = await accounts.findSession(r.cookies[cookie]);
    signedIn(a);
    return a;
  };
  app.get(
    '/api/v1/households/:householdId/upload-policy',
    {
      schema: {
        params: home,
        response: { 200: z.object({ maxBytes: z.number() }) },
      },
    },
    async (r) => {
      await service.tasks.scope(service.db, await actor(r), r.params.householdId);
      return { maxBytes: limit };
    },
  );
  app.get(
    '/api/v1/households/:householdId/tasks/:taskId/comments',
    {
      schema: {
        params: task,
        querystring: paging,
        response: {
          200: z.object({
            items: z.array(commentSchema),
            nextOffset: z.number().nullable(),
          }),
        },
      },
    },
    async (r) =>
      service.listComments(await actor(r), r.params.householdId, r.params.taskId, r.query.offset),
  );
  app.post(
    '/api/v1/households/:householdId/tasks/:taskId/comments',
    {
      schema: {
        params: task,
        body: commentWriteSchema,
        response: { 200: commentSchema },
      },
    },
    async (r) =>
      service.writeComment(await actor(r), r.params.householdId, r.params.taskId, r.body),
  );
  app.patch(
    '/api/v1/households/:householdId/tasks/:taskId/comments/:id',
    {
      schema: {
        params: task.extend({ id: z.uuid() }),
        body: commentPatchSchema,
        response: { 200: commentSchema },
      },
    },
    async (r) =>
      service.writeComment(
        await actor(r),
        r.params.householdId,
        r.params.taskId,
        r.body,
        r.params.id,
      ),
  );
  app.get(
    '/api/v1/households/:householdId/tasks/:taskId/activity',
    {
      schema: {
        params: task,
        querystring: paging,
        response: {
          200: z.object({
            items: z.array(activitySchema),
            nextOffset: z.number().nullable(),
          }),
        },
      },
    },
    async (r) =>
      service.activity(await actor(r), r.params.householdId, r.params.taskId, r.query.offset),
  );
  app.get(
    '/api/v1/households/:householdId/tasks/:taskId/attachments',
    { schema: { params: task, response: { 200: z.array(attachmentSchema) } } },
    async (r) => service.files(await actor(r), r.params.householdId, r.params.taskId),
  );
  app.post(
    '/api/v1/households/:householdId/tasks/:taskId/attachments',
    {
      config: { fileUpload: true },
      schema: { params: task, headers: z.object({ 'x-upload-id': z.uuid().optional() }), response: { 200: attachmentSchema } },
      preHandler: async (r) => {
        await service.task(await actor(r), r.params.householdId, r.params.taskId);
      },
    },
    async (r) => {
      const part = await r.file();
      if (!part) throw new AccountError('empty_file');
      return files.upload(await actor(r), r.params.householdId, r.params.taskId, part, r.headers['x-upload-id']);
    },
  );
  for (const mode of ['download', 'preview', 'thumbnail'] as const) {
    app.get(
      `/api/v1/households/:householdId/attachments/:id/${mode}`,
      { schema: { params: home.extend({ id: z.uuid() }) } },
      async (r, reply) => {
        const file = await service.file(await actor(r), r.params.householdId, r.params.id);
        if (
          mode !== 'download' &&
          !file.preview &&
          (file.mime !== 'application/pdf' || mode === 'thumbnail')
        )
          throw new AccountError('preview_unavailable', 404);
        const path = files.path(file.id, mode !== 'download' && file.preview, mode === 'thumbnail');
        try {
          await stat(path);
        } catch {
          throw new AccountError('file_not_found', 404);
        }
        reply
          .header('X-Content-Type-Options', 'nosniff')
          .header('Cache-Control', 'private, no-store');
        reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
        reply.header(
          'Content-Disposition',
          `${mode === 'download' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g, '%27')}`,
        );
        return reply
          .type(mode !== 'download' && file.preview ? 'image/jpeg' : file.mime)
          .send(createReadStream(path));
      },
    );
  }
  app.post(
    '/api/v1/households/:householdId/search',
    {
      schema: {
        params: home,
        body: paging.extend({
          q: z.string().trim().min(1).max(200),
          filterIds: z.array(z.uuid()).max(50).default([]),
          currentPlaceId: z.uuid().nullable().optional(),
        }),
        response: {
          200: z.object({
            items: z.array(searchHitSchema),
            nextOffset: z.number().nullable(),
            warnings: z.array(z.string()),
          }),
        },
      },
    },
    async (r) =>
      service.search(
        await actor(r),
        r.params.householdId,
        r.body.q,
        r.body.offset,
        r.body.filterIds,
        r.body.currentPlaceId,
      ),
  );
  app.get(
    '/api/v1/households/:householdId/search',
    {
      schema: {
        params: home,
        querystring: paging.extend({ q: z.string().trim().min(1).max(200) }),
        response: {
          200: z.object({
            items: z.array(searchHitSchema),
            nextOffset: z.number().nullable(),
            warnings: z.array(z.string()),
          }),
        },
      },
    },
    async (r) => service.search(await actor(r), r.params.householdId, r.query.q, r.query.offset),
  );
}
declare module 'fastify' {
  interface FastifyContextConfig {
    fileUpload?: boolean;
  }
}
