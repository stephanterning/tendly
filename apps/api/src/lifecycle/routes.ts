import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { templateSchema, templateInputSchema, recurrenceSchema, taskSchema, lifecycleSettingsSchema, lifecycleItemSchema, okSchema } from '@tendly/shared';
import type { AccountService } from '../accounts/service.js';
import { signedIn } from '../accounts/access.js';
import { TemplateService } from './templates.js';
import { LifecycleService } from './service.js';
const scope = z.object({ householdId: z.uuid() }), item = scope.extend({ id: z.uuid() });
export async function registerLifecycleRoutes(server: FastifyInstance, accounts: AccountService) {
  const app = server.withTypeProvider<ZodTypeProvider>(), templates = new TemplateService(accounts.db), lifecycle = new LifecycleService(accounts.db);
  const actor = async (request: FastifyRequest) => { const value = await accounts.findSession(request.cookies[accounts.origin.startsWith('https:') ? '__Host-tendly' : 'tendly_session']); signedIn(value); return value; };
  app.get('/api/v1/households/:householdId/templates', { schema: { params: scope, response: { 200: z.array(templateSchema) } } }, async r => templates.list(await actor(r), r.params.householdId));
  app.post('/api/v1/households/:householdId/templates', { schema: { params: scope, body: z.object({ taskId: z.uuid(), name: z.string().trim().min(1).max(100), recurrence: recurrenceSchema.nullable() }), response: { 200: templateSchema } } }, async r => templates.capture(await actor(r), r.params.householdId, r.body.taskId, r.body.name, r.body.recurrence));
  app.put('/api/v1/households/:householdId/templates/:id', { schema: { params: item, body: templateInputSchema.extend({ baseVersion: z.number().int().min(1) }), response: { 200: templateSchema } } }, async r => templates.save(await actor(r), r.params.householdId, r.body, r.params.id, r.body.baseVersion));
  app.post('/api/v1/households/:householdId/templates/:id/create', { schema: { params: item, body: z.object({ date: z.iso.date() }), response: { 200: taskSchema } } }, async r => templates.createInstance(await actor(r), r.params.householdId, r.params.id, r.body.date));
  app.delete('/api/v1/households/:householdId/templates/:id', { schema: { params: item, body: z.object({ baseVersion: z.number().int().min(1) }), response: { 200: okSchema } } }, async r => { await templates.remove(await actor(r), r.params.householdId, r.params.id, r.body.baseVersion); return { ok: true as const }; });
  app.get('/api/v1/households/:householdId/lifecycle', { schema: { params: scope, querystring: z.object({ kind: z.enum(['archive', 'trash']) }), response: { 200: z.array(lifecycleItemSchema) } } }, async r => lifecycle.list(await actor(r), r.params.householdId, r.query.kind));
  app.post('/api/v1/households/:householdId/tasks/:id/lifecycle', { schema: { params: item, body: z.object({ baseVersion: z.number().int().min(1), action: z.enum(['archive', 'unarchive', 'trash', 'restore', 'delete']), confirmed: z.boolean().default(false) }), response: { 200: okSchema } } }, async r => { await lifecycle.change(await actor(r), r.params.householdId, r.params.id, r.body.baseVersion, r.body.action, r.body.confirmed); return { ok: true as const }; });
  app.get('/api/v1/households/:householdId/lifecycle-settings', { schema: { params: scope, response: { 200: lifecycleSettingsSchema } } }, async r => { await lifecycle.tasks.scope(accounts.db, await actor(r), r.params.householdId); return lifecycle.settings(r.params.householdId); });
  app.put('/api/v1/households/:householdId/lifecycle-settings', { schema: { params: scope, body: lifecycleSettingsSchema, response: { 200: lifecycleSettingsSchema } } }, async r => lifecycle.saveSettings(await actor(r), r.params.householdId, r.body));
}
