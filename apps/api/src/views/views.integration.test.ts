import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import {
  allTasks,
  parseExpression,
  viewFieldsSchema,
  type FilterExpression,
  type TaskQuery,
} from '@tendly/shared';
import * as schema from '../db/schema.js';
import { migrateDatabase } from '../db/migrate.js';
import { AccountService } from '../accounts/service.js';
import { MailService } from '../accounts/mail.js';
import { TaskService } from '../tasks/service.js';
import { ContentService } from '../content/service.js';
import { buildApp } from '../app.js';
import { ViewService } from './service.js';
import { matchingTasks } from './query.js';
import { moveTask } from './move.js';
const databaseName = `tendly_views_${randomUUID().replaceAll('-', '')}`,
  origin = 'https://views.example.test';
let root: pg.Client,
  pool: pg.Pool,
  db: ReturnType<typeof drizzle<typeof schema>>,
  accounts: AccountService,
  service: ViewService,
  tasks: TaskService,
  app: Awaited<ReturnType<typeof buildApp>>;
const user = randomUUID(),
  other = randomUUID(),
  outsider = randomUUID(),
  home = randomUUID(),
  foreign = randomUUID();
let actor: NonNullable<Awaited<ReturnType<AccountService['findSession']>>>,
  member: typeof actor,
  intruder: typeof actor,
  session: string;
const rule = (field: string, operator: string, value: unknown) =>
  parseExpression({ type: 'predicate', field, operator, value });
const and = (...children: FilterExpression[]): FilterExpression => ({
  type: 'group',
  operator: 'AND',
  children,
});
const query = (expression: FilterExpression, extra: Partial<TaskQuery> = {}) =>
  service.query(actor, home, { expression, offset: 0, limit: 100, ...extra });
const definition = (name: string, expression: FilterExpression) => ({
  name,
  expression,
  icon: 'star' as const,
  color: 'blue' as const,
});
beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required');
  root = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await root.connect();
  await root.query(`CREATE DATABASE "${databaseName}"`);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.pathname = '/' + databaseName;
  await migrateDatabase(url.toString());
  pool = new pg.Pool({ connectionString: url.toString() });
  db = drizzle(pool, { schema });
  accounts = new AccountService(db, origin);
  service = new ViewService(db);
  tasks = new TaskService(db);
  await db.insert(schema.users).values([
    { id: user, name: 'Owner', email: 'owner@views.test' },
    { id: other, name: 'Member', email: 'member@views.test' },
    { id: outsider, name: 'Outsider', email: 'outsider@views.test' },
  ]);
  await db.insert(schema.households).values([
    { id: home, name: 'Home', timezone: 'Europe/Stockholm' },
    { id: foreign, name: 'Other', timezone: 'UTC' },
  ]);
  await db.insert(schema.memberships).values([
    { householdId: home, userId: user, role: 'admin' },
    { householdId: home, userId: other, role: 'member' },
    { householdId: foreign, userId: outsider, role: 'admin' },
  ]);
  session = await accounts.session(db, user);
  actor = (await accounts.findSession(session))!;
  member = (await accounts.findSession(await accounts.session(db, other)))!;
  intruder = (await accounts.findSession(await accounts.session(db, outsider)))!;
  app = await buildApp({
    checkDatabase: async () => {},
    accounts: {
      service: accounts,
      mail: new MailService(db, 'ab'.repeat(32), origin, async () => {}),
    },
  });
}, 30000);
afterAll(async () => {
  await app?.close();
  await pool?.end();
  if (root) {
    await root.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await root.end();
  }
});
it('uses typed set semantics, nested NOT and context values, with missing context never broadening a match', async () => {
  const place = await tasks.entityWrite(actor, home, {
      kind: 'place', name: 'Home', latitude: 59.3, longitude: 18.1, radius: 100,
    }),
    away = await tasks.entityWrite(actor, home, { kind: 'place', name: 'Away' });
  const car = await tasks.entityWrite(actor, home, { kind: 'resource', name: 'Car' }),
    trailer = await tasks.entityWrite(actor, home, { kind: 'resource', name: 'Trailer' });
  const a = await tasks.create(actor, home, {
      title: 'sets anywhere',
      column: 'todo',
      assignees: [user],
    }),
    b = await tasks.create(actor, home, {
      title: 'sets both places',
      places: [place.id, away.id],
      resources: [car.id],
    }),
    c = await tasks.create(actor, home, {
      title: 'sets away',
      places: [away.id],
      resources: [car.id, trailer.id],
      assignees: [other],
    });
  const base = rule('title', 'CONTAINS', 'sets ');
  expect(
    (await query(and(base, rule('places', 'COMPATIBLE', [place.id])))).items.map((t) => t.id),
  ).toEqual([a.id, b.id]);
  expect(
    (await query(and(base, rule('resources', 'FEASIBLE', [car.id])))).items.map((t) => t.id),
  ).toEqual([a.id, b.id]);
  expect(
    (await query(and(base, rule('resources', 'IN', [car.id])))).items.map((t) => t.id),
  ).toEqual([b.id, c.id]);
  expect(
    (await query(and(base, rule('assignees', 'IN', { token: 'CURRENT_USER' })))).items.map(
      (t) => t.id,
    ),
  ).toEqual([a.id]);
  expect(
    (
      await service.query(member, home, {
        expression: and(base, rule('assignees', 'IN', { token: 'CURRENT_USER' })),
        offset: 0,
        limit: 10,
      })
    ).items.map((t) => t.id),
  ).toEqual([c.id]);
  const missing = await query(
    and(base, {
      type: 'group',
      operator: 'NOT',
      children: [rule('places', 'COMPATIBLE', { token: 'CURRENT_PLACE' })],
    }),
  );
  expect(missing).toMatchObject({ count: 0, warnings: ['current_place_unavailable'] });
  const here = and(base, rule('places', 'COMPATIBLE', { token: 'CURRENT_PLACE' }));
  expect(
    (await query(here, { currentPlaceId: place.id })).items.map((t) => t.id),
  ).toEqual([a.id, b.id]);
  const outside = await query(here, { currentPlaceId: null });
  expect(outside.items.map((t) => t.id)).toEqual([a.id]);
  expect(outside.warnings).toEqual([]);
  const hereFilter = await service.filterWrite(actor, home, definition('Here', here));
  const searchHere = await new ContentService(db).search(actor, home, 'sets', 0, [hereFilter.id], place.id);
  expect(searchHere.items.map((hit) => hit.id)).toEqual([a.id, b.id]);
  expect(
    (
      await query(
        and(base, {
          type: 'group',
          operator: 'NOT',
          children: [rule('resources', 'FEASIBLE', [car.id])],
        }),
      )
    ).items.map((t) => t.id),
  ).toEqual([c.id]);
  const due = await tasks.create(actor, home, {
    title: 'timezone task',
    deadlineDate: '2026-11-02',
  });
  const result = await matchingTasks(
    db,
    tasks,
    home,
    [rule('deadlineDate', 'EQ', { token: 'TODAY' })],
    {
      userId: user,
      currentPlaceId: null,
      timezone: 'Europe/Stockholm',
      now: Date.parse('2026-11-01T23:30:00Z'),
    },
    { offset: 0, limit: 10, sort: 'manual' },
  );
  expect(result.items.map((t) => t.id)).toContain(due.id);
});
it('filters and sorts the whole set before paging or counting and treats SQL-like text as data', async () => {
  await db.insert(schema.tasks).values(
    Array.from({ length: 280 }, (_, i) => ({
      householdId: home,
      title: 'page ' + i,
      column: 'todo' as const,
      high: i >= 260,
      order: 100000 + i * 1024,
      createdBy: user,
      deadlineDate: i >= 260 ? '2026-12-' + String(30 - (i - 260)).padStart(2, '0') : null,
    })),
  );
  const filter = and(rule('title', 'CONTAINS', 'page '), rule('high', 'EQ', true));
  const view = await service.viewWrite(
    actor,
    home,
    viewFieldsSchema.parse({
      ...definition('Deadline', filter),
      presentation: 'list',
      quickFilters: [],
      sort: 'deadline',
      epicLanes: false,
      showEmptyLanes: false,
      cardProperties: [],
    }),
  );
  const one = await service.query(actor, home, { viewId: view.id, offset: 0, limit: 7 }),
    two = await service.query(actor, home, { viewId: view.id, offset: 7, limit: 7 });
  expect(one.count).toBe(20);
  expect(one.nextOffset).toBe(7);
  expect(one.items[0]?.title).toBe('page 279');
  expect(two.items[0]?.title).toBe('page 272');
  expect((await query(rule('title', 'CONTAINS', "' OR true --"))).count).toBe(0);
  await expect(
    query({ type: 'predicate', field: 'title', operator: 'GT', value: 'x' } as FilterExpression),
  ).rejects.toThrow();
});
it('combines the shared base and chips with AND and keeps view preferences personal', async () => {
  const catalog = await service.catalog(actor, home),
    board = catalog.views.find((v) => v.builtin === 'board')!,
    now = catalog.views.find((v) => v.builtin === 'now')!,
    high = catalog.filters.find((f) => f.builtin === 'high')!;
  const first = await service.stateWrite(actor, home, board.id, 0, {
    activeFilters: [high.id],
    favorite: true,
  });
  expect(first.splitFutureColumns).toBe(false);
  await service.stateWrite(actor, home, board.id, first.version, { splitFutureColumns: true });
  expect((await service.catalog(actor, home)).states[board.id]).toMatchObject({
    activeFilters: [high.id],
    favorite: true,
    splitFutureColumns: true,
  });
  const enabled = await service.query(actor, home, { viewId: board.id, offset: 0, limit: 100 });
  expect(enabled.items.every((t) => t.high)).toBe(true);
  const personal = await service.catalog(member, home);
  expect(personal.states[board.id]).toBeUndefined();
  expect((await service.catalog(actor, home)).states[now.id]).toBeUndefined();
  await expect(service.stateWrite(actor, home, board.id, 0, { activeFilters: [] })).rejects.toThrow(
    'personal_state_conflict',
  );
  expect(await service.stateWrite(actor, home, board.id, first.version + 1, { favorite: false }))
    .toMatchObject({ activeFilters: [high.id], favorite: false, splitFutureColumns: true });
  const revised = await service.viewWrite(
    actor,
    home,
    { ...board, expression: rule('title', 'CONTAINS', 'sets ') },
    board.id,
    board.version,
  );
  expect((await service.query(actor, home, { viewId: board.id, offset: 0, limit: 10 })).count).toBe(
    0,
  );
  await expect(service.viewWrite(member, home, board, board.id, board.version)).rejects.toThrow(
    'view_conflict',
  );
  await expect(
    service.viewCommand(actor, home, board.id, revised.version, 'delete'),
  ).rejects.toThrow('builtin_view_required');
  const reset = await service.viewCommand(actor, home, board.id, revised.version, 'reset');
  expect(reset.expression).toEqual(allTasks);
});
it('keeps reusable filter history, refuses races and restores a snapshot as a new revision', async () => {
  const created = await service.filterWrite(
    actor,
    home,
    definition('Shared', rule('high', 'EQ', true)),
  );
  const edits = await Promise.allSettled(
    [actor, member].map((a) =>
      service.filterWrite(
        a,
        home,
        { ...created, name: 'Edited ' + a.user.id },
        created.id,
        created.version,
      ),
    ),
  );
  expect(edits.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
  const history = await service.history(actor, home, created.id);
  expect(history.map((v) => v.version)).toEqual([2, 1]);
  const restored = await service.filterCommand(actor, home, created.id, 2, 'restore', 1);
  expect(restored).toMatchObject({ name: 'Shared', version: 3, creatorId: user });
  const deleted = await service.filterCommand(actor, home, created.id, 3, 'delete');
  expect(deleted.deleted).toBe(true);
  const revived = await service.filterCommand(actor, home, created.id, 4, 'undelete');
  expect(revived.deleted).toBe(false);
  await expect(service.filterCommand(actor, home, created.id, 4, 'restore', 1)).rejects.toThrow(
    'filter_conflict',
  );
});
it('scopes every new route and rejects cross-household references and move anchors', async () => {
  const catalog = await service.catalog(actor, home),
    view = catalog.views[0]!,
    filter = catalog.filters[0]!,
    task = await tasks.create(actor, home, { title: 'private' });
  const foreignEntity = await tasks.entityWrite(intruder, foreign, {
      kind: 'place',
      name: 'Secret',
      latitude: 59.3,
      longitude: 18.1,
      radius: 100,
    }),
    foreignTask = await tasks.create(intruder, foreign, { title: 'Secret task' });
  await expect(
    service.filterWrite(actor, home, definition('Leak', rule('places', 'IN', [foreignEntity.id]))),
  ).rejects.toThrow('invalid_filter_reference');
  const invalidPlace = await query(rule('places', 'COMPATIBLE', { token: 'CURRENT_PLACE' }), {
    currentPlaceId: foreignEntity.id,
  });
  expect(invalidPlace).toMatchObject({ count: 0, warnings: ['current_place_unavailable'] });
  await expect(query(allTasks, { filterIds: [randomUUID()] })).rejects.toThrow(
    'invalid_filter_reference',
  );
  await expect(
    moveTask(db, actor, home, task.id, {
      baseVersion: 1,
      orderVersion: 0,
      beforeId: foreignTask.id,
    }),
  ).rejects.toThrow('invalid_order_target');
  const foreignSession = await accounts.session(db, outsider),
    base = '/api/v1/households/' + home;
  const requests = [
    ['GET', '/view-catalog', undefined],
    ['GET', `/filters/${filter.id}/versions`, undefined],
    ['POST', '/filters', definition('x', allTasks)],
    ['PUT', `/filters/${filter.id}`, { baseVersion: 1, changes: definition('x', allTasks) }],
    ['POST', `/filters/${filter.id}/command`, { baseVersion: 1, command: 'delete' }],
    ['POST', '/views', view],
    ['PUT', `/views/${view.id}`, { baseVersion: 1, changes: view }],
    ['POST', `/views/${view.id}/command`, { baseVersion: 1, command: 'delete' }],
    ['PUT', `/views/${view.id}/state`, { baseVersion: 0, favorite: true }],
    ['POST', '/task-query', { viewId: view.id }],
    ['POST', `/tasks/${task.id}/move`, { baseVersion: 1, orderVersion: 0, beforeId: null }],
    ['POST', '/search', { q: 'private', filterIds: [filter.id] }],
  ] as const;
  for (const [method, path, payload] of requests) {
    for (const token of [undefined, foreignSession]) {
      const response = await app.inject({
        method,
        url: base + path,
        headers: { origin, ...(token ? { cookie: `__Host-tendly=${token}` } : {}) },
        ...(payload ? { payload } : {}),
      });
      expect(response.statusCode, method + ' ' + path).toBe(token ? 404 : 401);
    }
  }
});
it('moves atomically, preserves one order across views and refuses stale ordering Undo without changing fields', async () => {
  const a = await tasks.create(actor, home, { title: 'move a', column: 'todo' }),
    b = await tasks.create(actor, home, { title: 'move b', column: 'todo' }),
    c = await tasks.create(actor, home, { title: 'move c', column: 'todo' });
  const first = await moveTask(db, actor, home, c.id, {
    baseVersion: c.version,
    orderVersion: 0,
    beforeId: a.id,
    column: 'within_month',
  });
  expect((await query(rule('title', 'CONTAINS', 'move '))).items.map((t) => t.id)).toEqual([
    c.id,
    a.id,
    b.id,
  ]);
  await moveTask(db, member, home, b.id, {
    baseVersion: b.version,
    orderVersion: first.orderVersion,
    beforeId: c.id,
  });
  await expect(
    moveTask(db, actor, home, c.id, {
      baseVersion: first.task.version,
      orderVersion: first.orderVersion,
      ...first.inverse,
    }),
  ).rejects.toThrow('order_conflict');
  expect((await tasks.get(db, home, c.id, 'Europe/Stockholm')).column).toBe('within_month');
  const changed = await tasks.patch(member, home, a.id, a.version, { title: 'move a updated' });
  const moved = await moveTask(db, actor, home, a.id, {
    baseVersion: a.version,
    orderVersion: 2,
    afterId: b.id,
  });
  expect(moved.task.title).toBe(changed.title);
  const undone = await moveTask(db, actor, home, a.id, {
    baseVersion: moved.task.version,
    orderVersion: moved.orderVersion,
    ...moved.inverse,
  });
  expect(undone.orderVersion).toBe(4);
  await expect(
    moveTask(db, actor, home, a.id, { baseVersion: 1, orderVersion: 4, beforeId: null }),
  ).rejects.toThrow('task_conflict');
});
it('uses the same saved filters for search tasks and their comments before pagination', async () => {
  const filter = await service.filterWrite(
    actor,
    home,
    definition('Search high', rule('high', 'EQ', true)),
  );
  const content = new ContentService(db),
    task = await tasks.create(actor, home, { title: 'searchterm eligible', high: true });
  await tasks.create(actor, home, { title: 'searchterm hidden' });
  await db.insert(schema.comments).values({
    taskId: task.id,
    authorId: user,
    body: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'searchterm comment' }] }],
    },
  });
  const found = await content.search(actor, home, 'searchterm', 0, [filter.id]);
  expect(found.items).toHaveLength(2);
  expect(found.items.every((hit) => hit.taskId === task.id)).toBe(true);
  await db.update(schema.tasks).set({ trashedAt: new Date() }).where(eq(schema.tasks.id, task.id));
  expect((await content.search(actor, home, 'searchterm', 0, [filter.id])).items).toHaveLength(0);
});

it('broadcasts definition edits but never read-only previews or search queries', async () => {
  const headers = { origin, cookie: `__Host-tendly=${session}` };
  const socket = await app.injectWS(`/api/v1/households/${home}/events`, {
    headers,
    socket: { remoteAddress: '127.0.0.1' },
  });
  const messages: string[] = [];
  socket.on('message', (value) => messages.push(String(value)));
  try {
    await expect.poll(() => messages.length).toBe(1);
    const base = '/api/v1/households/' + home;
    for (const [path, payload] of [
      ['/task-query', { expression: allTasks }],
      ['/search', { q: 'sets' }],
    ] as const)
      expect(
        (await app.inject({ method: 'POST', url: base + path, headers, payload })).statusCode,
      ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: base + '/filters',
          headers,
          payload: definition('Live', allTasks),
        })
      ).statusCode,
    ).toBe(200);
    await expect.poll(() => messages.length).toBe(2);
    expect(JSON.parse(messages[1]!).resources).toEqual(['filters']);
  } finally {
    socket.close();
  }
});
it('searches formatted words and mentions with the same text projection as description filters', async () => {
  const body = {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [
          { type: 'text', text: 'hol' },
          { type: 'text', text: 'iday', marks: [{ type: 'bold' }] },
          { type: 'hardBreak' },
          { type: 'text', text: 'plans ' },
          { type: 'mention', attrs: { id: user, label: 'Owner' } },
        ],
      },
    ],
  };
  const task = await tasks.create(actor, home, { title: 'zz Formatted content', description: body });
  const content = new ContentService(db);
  const comment = await content.writeComment(actor, home, task.id, { body });
  const filter = await service.filterWrite(
    actor,
    home,
    definition('Formatted description', rule('description', 'CONTAINS', 'holiday')),
  );
  for (const text of ['holiday', '@Owner', 'holiday\nplans']) {
    const found = await content.search(actor, home, text, 0, [filter.id]);
    expect(found.items.map((hit) => hit.id).sort()).toEqual([task.id, comment.id].sort());
    // Earlier tests populated more than one batch of unrelated tasks.
    const global = await content.search(actor, home, text, 0, []);
    expect(global.items.map((hit) => hit.id).sort()).toEqual([task.id, comment.id].sort());
  }
  expect((await content.search(actor, home, 'holidayplans', 0, [filter.id])).items).toHaveLength(0);
  expect((await content.search(actor, home, 'holiday', 1, [filter.id])).items).toHaveLength(1);
});
