import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { taskSchema, entitySchema, filterAstSchema, allFilter } from '@tendly/shared';
import type { AccountService } from '../accounts/service.js';
import { signedIn } from '../accounts/access.js';
import { TaskService } from '../tasks/service.js';
import { entities } from '../tasks/schema.js';
import { comments } from './schema.js';
import { inspectRichText } from './rich-text.js';
import { filterTasks } from '../planning/filter.js';
export async function registerSearchRoutes(server: FastifyInstance, accounts: AccountService) {
  const app = server.withTypeProvider<ZodTypeProvider>(), service = new TaskService(accounts.db);
  const actor = async (r: FastifyRequest) => { const current = await accounts.findSession(r.cookies[accounts.origin.startsWith('https:') ? '__Host-tendly' : 'tendly_session']); signedIn(current); return current; };
  app.post('/api/v1/households/:householdId/search', { schema: { params: z.object({ householdId: z.uuid() }), body: z.object({ query: z.string().max(200), definition: filterAstSchema.nullable(), currentPlace: z.uuid().nullable(), offset: z.number().int().min(0).default(0) }), response: { 200: z.object({ tasks: z.array(z.object({ task: taskSchema, archived: z.boolean() })), entities: z.array(entitySchema), count: z.number().int(), nextOffset: z.number().nullable() }) } } }, async r => {
    const current = await actor(r), householdId = r.params.householdId;
    return accounts.db.transaction(async tx => {
      const household = await service.scope(tx, current, householdId), graph = await service.graph(tx, householdId, household.timezone);
      const query = r.body.query.trim().toLocaleLowerCase(), matches = (text: string) => text.toLocaleLowerCase().includes(query);
      const catalog = await tx.select().from(entities).where(eq(entities.householdId, householdId));
      const matchedEntities = catalog.filter(e => matches(e.name) || matches(e.description)), ids = new Set(matchedEntities.map(e => e.id));
      const matchedComments = new Set((await tx.select().from(comments).where(eq(comments.householdId, householdId))).filter(c => matches(inspectRichText(c.body).text)).map(c => c.taskId));
      const candidates = graph.rows.filter(row => !row.trashedAt).map(row => graph.task(row.id)).filter(task => matches(task.title) || matches(inspectRichText(task.description).text) || matchedComments.has(task.id) || !!task.epicId && ids.has(task.epicId) || task.tags.some(id => ids.has(id)));
      const found = await filterTasks(tx, candidates, [r.body.definition ?? allFilter], { userId: current.user.id, currentPlace: r.body.currentPlace, timezone: household.timezone });
      const archived = new Set(graph.rows.filter(row => row.archivedAt).map(row => row.id));
      return { tasks: found.slice(r.body.offset, r.body.offset + 50).map(task => ({ task, archived: archived.has(task.id) })), entities: matchedEntities.map(e => entitySchema.parse(e)), count: found.length, nextOffset: found.length > r.body.offset + 50 ? r.body.offset + 50 : null };
    }, { isolationLevel: 'repeatable read' });
  });
}
