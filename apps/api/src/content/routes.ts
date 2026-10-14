import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { taskContentSchema, fileSchema, okSchema } from '@tendly/shared';
import type { AccountService } from '../accounts/service.js';
import { signedIn } from '../accounts/access.js';
import { ContentService } from './service.js';
const scope = z.object({ householdId: z.uuid() }), item = scope.extend({ id: z.uuid() }), task = scope.extend({ taskId: z.uuid() });
export async function registerContentRoutes(server: FastifyInstance, accounts: AccountService, directory: string) {
  const app = server.withTypeProvider<ZodTypeProvider>(), service = new ContentService(accounts.db, directory);
  const actor = async (r: FastifyRequest) => { const current = await accounts.findSession(r.cookies[accounts.origin.startsWith('https:') ? '__Host-tendly' : 'tendly_session']); signedIn(current); return current; };
  app.get('/api/v1/households/:householdId/tasks/:taskId/content', { schema: { params: task, response: { 200: taskContentSchema } } }, async r => service.list(await actor(r), r.params.householdId, r.params.taskId));
  app.post('/api/v1/households/:householdId/tasks/:taskId/comments', { schema: { params: task, body: z.object({ body: z.string().min(1).max(100000) }), response: { 200: okSchema } } }, async r => { await service.comment(await actor(r), r.params.householdId, r.params.taskId, r.body.body); return { ok: true as const }; });
  app.put('/api/v1/households/:householdId/tasks/:taskId/comments/:id', { schema: { params: task.extend({ id: z.uuid() }), body: z.object({ body: z.string().min(1).max(100000), baseVersion: z.number().int().min(1) }), response: { 200: okSchema } } }, async r => { await service.comment(await actor(r), r.params.householdId, r.params.taskId, r.body.body, r.params.id, r.body.baseVersion); return { ok: true as const }; });
  app.delete('/api/v1/households/:householdId/comments/:id', { schema: { params: item, body: z.object({ baseVersion: z.number().int().min(1) }), response: { 200: okSchema } } }, async r => { await service.removeComment(await actor(r), r.params.householdId, r.params.id, r.body.baseVersion); return { ok: true as const }; });
  app.post('/api/v1/households/:householdId/tasks/:taskId/files', { bodyLimit: 23 * 1024 * 1024, schema: { params: task, body: z.object({ name: z.string().min(1).max(255).refine(name => [...name].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)), base64: z.string().max(23 * 1024 * 1024), commentId: z.uuid().nullable().optional() }), response: { 200: fileSchema } } }, async r => service.upload(await actor(r), r.params.householdId, r.params.taskId, r.body));
  app.get('/api/v1/households/:householdId/files/:id', { schema: { params: item } }, async (r, reply) => {
    const { file, bytes } = await service.download(await actor(r), r.params.householdId, r.params.id);
    return reply.header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff').header('Content-Security-Policy', "default-src 'none'; sandbox").header('Content-Disposition', `${file.mime.startsWith('image/') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`).type(file.mime).send(bytes);
  });
  app.delete('/api/v1/households/:householdId/files/:id', { schema: { params: item, body: z.object({}), response: { 200: okSchema } } }, async r => { await service.removeFile(await actor(r), r.params.householdId, r.params.id); return { ok: true as const }; });
}
