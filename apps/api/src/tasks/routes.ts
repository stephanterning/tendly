import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { taskSchema, taskCreateSchema, taskPatchSchema, taskConflictSchema, errorSchema, entitySchema, entityCreateSchema, entityPatchSchema, okSchema, planningSettingsSchema, thresholdsSchema } from '@tendly/shared';
import { signedIn } from '../accounts/access.js';
import type { AccountService } from '../accounts/service.js';
import { TaskService, TaskConflict } from './service.js';
const scope = z.object({ householdId: z.uuid() });
const item = scope.extend({ id: z.uuid() });
export async function registerTaskRoutes(server: FastifyInstance, accounts: AccountService) {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const service = new TaskService(accounts.db);
  const sessionCookie = accounts.origin.startsWith('https:') ? '__Host-tendly' : 'tendly_session';
  const actor = async (request: FastifyRequest) => {
    const current = await accounts.findSession(request.cookies[sessionCookie]);
    signedIn(current);
    return current;
  };
  app.get('/api/v1/households/:householdId/tasks', {
    schema: { params: scope, querystring: z.object({ view: z.enum(['now', 'board']).default('board'), offset: z.coerce.number().int().min(0).default(0), search: z.string().max(200).default(''), includeSubtasks: z.enum(['true', 'false']).default('false'), parentId: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(100) }), response: { 200: z.object({ items: z.array(taskSchema), nextOffset: z.number().nullable() }) } },
  }, async request => service.list(await actor(request), request.params.householdId, request.query.view, request.query.offset, request.query.limit, request.query.includeSubtasks === 'true', request.query.parentId, request.query.search));
  app.get('/api/v1/households/:householdId/tasks/:id', { schema: { params: item, response: { 200: taskSchema } } }, async request => {
    const current = await actor(request);
    return service.db.transaction(async tx => {
      const household = await service.scope(tx, current, request.params.householdId);
      return service.get(tx, household.id, request.params.id, household.timezone);
    }, { isolationLevel: 'repeatable read' });
  });
  app.post('/api/v1/households/:householdId/tasks', { schema: { params: scope, body: taskCreateSchema, response: { 200: taskSchema } } }, async request => service.create(await actor(request), request.params.householdId, request.body));
  app.patch('/api/v1/households/:householdId/tasks/:id', { schema: { params: item, body: taskPatchSchema, response: { 200: taskSchema, 409: z.union([taskConflictSchema, errorSchema]) } } }, async (request, reply) => {
    try { return await service.patch(await actor(request), request.params.householdId, request.params.id, request.body.baseVersion, request.body.changes, request.body.confirmUnavailable, request.body.confirmDescendants); }
    catch (error) {
      if (error instanceof TaskConflict) return reply.code(409).send({ error: 'task_conflict' as const, fields: error.fields, current: error.current });
      throw error;
    }
  });
  app.post('/api/v1/households/:householdId/tasks/:id/order', { schema: { params: item, body: z.object({ baseVersion: z.number().int().min(1), beforeId: z.uuid().nullable() }), response: { 200: taskSchema } } }, async r => service.reorder(await actor(r), r.params.householdId, r.params.id, r.body.baseVersion, r.body.beforeId));
  app.get('/api/v1/households/:householdId/entities', { schema: { params: scope, response: { 200: z.array(entitySchema) } } }, async request => service.entityList(await actor(request), request.params.householdId));
  app.post('/api/v1/households/:householdId/entities', { schema: { params: scope, body: entityCreateSchema, response: { 200: entitySchema } } }, async request => service.entityWrite(await actor(request), request.params.householdId, request.body));
  app.patch('/api/v1/households/:householdId/entities/:id', { schema: { params: item, body: entityPatchSchema, response: { 200: entitySchema } } }, async request => service.entityWrite(await actor(request), request.params.householdId, request.body.changes, request.params.id, request.body.baseVersion));
  app.delete('/api/v1/households/:householdId/entities/:id', { schema: { params: item, body: z.object({ baseVersion: z.number().int().min(1) }), response: { 200: okSchema } } }, async request => {
    await service.entityDelete(await actor(request), request.params.householdId, request.params.id, request.body.baseVersion);
    return { ok: true as const };
  });
  app.post('/api/v1/households/:householdId/entities/:id/order', { schema: { params: item, body: z.object({ baseVersion: z.number().int().min(1), direction: z.enum(['up', 'down']) }), response: { 200: okSchema } } }, async request => {
    await service.reorderEntity(await actor(request), request.params.householdId, request.params.id, request.body.direction, request.body.baseVersion);
    return { ok: true as const };
  });
  app.get('/api/v1/households/:householdId/planning-settings', { schema: { params: scope, response: { 200: planningSettingsSchema } } }, async request => {
    await service.scope(service.db, await actor(request), request.params.householdId);
    return service.settings(service.db, request.params.householdId);
  });
  app.put('/api/v1/households/:householdId/planning-settings', { schema: { params: scope, body: z.object({ baseVersion: z.number().int().min(0), thresholds: thresholdsSchema }), response: { 200: planningSettingsSchema } } }, async request => service.updateSettings(await actor(request), request.params.householdId, request.body.baseVersion, request.body.thresholds));
}
