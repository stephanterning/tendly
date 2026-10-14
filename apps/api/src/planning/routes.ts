import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { filterAstSchema, filterInput, viewInput, filterDocumentSchema, viewDocumentSchema, planningLibrarySchema, personalViewSchema, viewResultsSchema, okSchema } from '@tendly/shared';
import { signedIn } from '../accounts/access.js';
import type { AccountService } from '../accounts/service.js';
import { PlanningService } from './service.js';
const scope = z.object({ householdId: z.uuid() }), item = scope.extend({ id: z.uuid() });
const version = z.object({ baseVersion: z.number().int().min(1) });
export async function registerPlanningRoutes(server: FastifyInstance, accounts: AccountService) {
  const app = server.withTypeProvider<ZodTypeProvider>(), service = new PlanningService(accounts.db);
  const actor = async (request: FastifyRequest) => {
    const current = await accounts.findSession(request.cookies[accounts.origin.startsWith('https:') ? '__Host-tendly' : 'tendly_session']);
    signedIn(current); return current;
  };
  app.get('/api/v1/households/:householdId/planning', { schema: { params: scope, response: { 200: planningLibrarySchema } } }, async r => service.library(await actor(r), r.params.householdId));
  app.post('/api/v1/households/:householdId/filters', { schema: { params: scope, body: filterInput, response: { 200: filterDocumentSchema } } }, async r => service.saveFilter(await actor(r), r.params.householdId, r.body));
  app.put('/api/v1/households/:householdId/filters/:id', { schema: { params: item, body: filterInput.extend(version.shape), response: { 200: filterDocumentSchema } } }, async r => service.saveFilter(await actor(r), r.params.householdId, r.body, r.params.id, r.body.baseVersion));
  app.get('/api/v1/households/:householdId/filters/:id/history', { schema: { params: item, response: { 200: z.array(z.object({ version: z.number(), definition: filterAstSchema, createdAt: z.string() })) } } }, async r => service.history(await actor(r), r.params.householdId, r.params.id));
  app.post('/api/v1/households/:householdId/filter-preview', { schema: { params: scope, body: z.object({ definition: filterAstSchema, currentPlace: z.uuid().nullable() }), response: { 200: viewResultsSchema } } }, async r => service.results(await actor(r), r.params.householdId, { preview: r.body.definition, currentPlace: r.body.currentPlace, offset: 0, limit: 20 }));
  app.post('/api/v1/households/:householdId/views', { schema: { params: scope, body: viewInput, response: { 200: viewDocumentSchema } } }, async r => service.saveView(await actor(r), r.params.householdId, r.body));
  app.put('/api/v1/households/:householdId/views/:id', { schema: { params: item, body: viewInput.extend(version.shape), response: { 200: viewDocumentSchema } } }, async r => service.saveView(await actor(r), r.params.householdId, r.body, r.params.id, r.body.baseVersion));
  app.put('/api/v1/households/:householdId/views/:id/personal', { schema: { params: item, body: personalViewSchema, response: { 200: personalViewSchema } } }, async r => service.personal(await actor(r), r.params.householdId, r.params.id, r.body));
  app.get('/api/v1/households/:householdId/views/:id/tasks', { schema: { params: item, querystring: z.object({ offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(100).default(100) }), response: { 200: viewResultsSchema } } }, async r => service.results(await actor(r), r.params.householdId, { viewId: r.params.id, ...r.query }));
  app.delete('/api/v1/households/:householdId/filters/:id', { schema: { params: item, body: version, response: { 200: okSchema } } }, async r => { await service.remove(await actor(r), r.params.householdId, 'filter', r.params.id, r.body.baseVersion); return { ok: true as const }; });
  app.delete('/api/v1/households/:householdId/views/:id', { schema: { params: item, body: version, response: { 200: okSchema } } }, async r => { await service.remove(await actor(r), r.params.householdId, 'view', r.params.id, r.body.baseVersion); return { ok: true as const }; });
}
