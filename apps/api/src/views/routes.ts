import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  filterFieldsSchema,
  savedFilterSchema,
  filterVersionSchema,
  viewFieldsSchema,
  savedViewSchema,
  viewStateSchema,
  viewCatalogSchema,
  taskQuerySchema,
  taskQueryResultSchema,
  moveTaskSchema,
  moveTaskResultSchema,
  taskConflictSchema,
  errorSchema,
} from '@tendly/shared';
import type { AccountService } from '../accounts/service.js';
import { signedIn } from '../accounts/access.js';
import { TaskConflict } from '../tasks/service.js';
import { ViewService } from './service.js';
import { moveTask } from './move.js';
const scope = z.object({ householdId: z.uuid() }),
  item = scope.extend({ id: z.uuid() });
const revision = z.number().int().positive();
export async function registerViewRoutes(server: FastifyInstance, accounts: AccountService) {
  const app = server.withTypeProvider<ZodTypeProvider>(),
    service = new ViewService(accounts.db);
  const cookie = accounts.origin.startsWith('https:') ? '__Host-tendly' : 'tendly_session';
  const actor = async (r: FastifyRequest) => {
    const current = await accounts.findSession(r.cookies[cookie]);
    signedIn(current);
    return current;
  };
  app.get(
    '/api/v1/households/:householdId/view-catalog',
    { schema: { params: scope, response: { 200: viewCatalogSchema } } },
    async (r) => service.catalog(await actor(r), r.params.householdId),
  );
  app.post(
    '/api/v1/households/:householdId/filters',
    { schema: { params: scope, body: filterFieldsSchema, response: { 200: savedFilterSchema } } },
    async (r) => service.filterWrite(await actor(r), r.params.householdId, r.body),
  );
  app.put(
    '/api/v1/households/:householdId/filters/:id',
    {
      schema: {
        params: item,
        body: z.object({ baseVersion: revision, changes: filterFieldsSchema }),
        response: { 200: savedFilterSchema },
      },
    },
    async (r) =>
      service.filterWrite(
        await actor(r),
        r.params.householdId,
        r.body.changes,
        r.params.id,
        r.body.baseVersion,
      ),
  );
  app.post(
    '/api/v1/households/:householdId/filters/:id/command',
    {
      schema: {
        params: item,
        body: z.object({
          baseVersion: revision,
          command: z.enum(['delete', 'undelete', 'reset', 'restore']),
          version: revision.optional(),
        }),
        response: { 200: savedFilterSchema },
      },
    },
    async (r) =>
      service.filterCommand(
        await actor(r),
        r.params.householdId,
        r.params.id,
        r.body.baseVersion,
        r.body.command,
        r.body.version,
      ),
  );
  app.get(
    '/api/v1/households/:householdId/filters/:id/versions',
    { schema: { params: item, response: { 200: z.array(filterVersionSchema) } } },
    async (r) => service.history(await actor(r), r.params.householdId, r.params.id),
  );
  app.post(
    '/api/v1/households/:householdId/views',
    { schema: { params: scope, body: viewFieldsSchema, response: { 200: savedViewSchema } } },
    async (r) => service.viewWrite(await actor(r), r.params.householdId, r.body),
  );
  app.put(
    '/api/v1/households/:householdId/views/:id',
    {
      schema: {
        params: item,
        body: z.object({ baseVersion: revision, changes: viewFieldsSchema }),
        response: { 200: savedViewSchema },
      },
    },
    async (r) =>
      service.viewWrite(
        await actor(r),
        r.params.householdId,
        r.body.changes,
        r.params.id,
        r.body.baseVersion,
      ),
  );
  app.post(
    '/api/v1/households/:householdId/views/:id/command',
    {
      schema: {
        params: item,
        body: z.object({ baseVersion: revision, command: z.enum(['delete', 'undelete', 'reset']) }),
        response: { 200: savedViewSchema },
      },
    },
    async (r) =>
      service.viewCommand(
        await actor(r),
        r.params.householdId,
        r.params.id,
        r.body.baseVersion,
        r.body.command,
      ),
  );
  app.put(
    '/api/v1/households/:householdId/views/:id/state',
    {
      schema: {
        params: item,
        body: z.object({
          baseVersion: z.number().int().min(0),
          favorite: z.boolean().optional(),
          activeFilters: z.array(z.uuid()).max(50).optional(),
          splitFutureColumns: z.boolean().optional(),
        }),
        response: { 200: viewStateSchema },
      },
    },
    async (r) =>
      service.stateWrite(
        await actor(r),
        r.params.householdId,
        r.params.id,
        r.body.baseVersion,
        r.body,
      ),
  );
  app.post(
    '/api/v1/households/:householdId/task-query',
    { schema: { params: scope, body: taskQuerySchema, response: { 200: taskQueryResultSchema } } },
    async (r) => service.query(await actor(r), r.params.householdId, r.body),
  );
  app.post(
    '/api/v1/households/:householdId/tasks/:id/move',
    {
      schema: {
        params: item,
        body: moveTaskSchema,
        response: { 200: moveTaskResultSchema, 409: z.union([taskConflictSchema, errorSchema]) },
      },
    },
    async (r, reply) => {
      try {
        return await moveTask(
          accounts.db,
          await actor(r),
          r.params.householdId,
          r.params.id,
          r.body,
        );
      } catch (e) {
        if (e instanceof TaskConflict)
          return reply
            .code(409)
            .send({ error: 'task_conflict' as const, current: e.current, fields: e.fields });
        throw e;
      }
    },
  );
}
