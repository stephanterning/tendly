import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import { migrateDatabase } from '../db/migrate.js';
import { AccountService } from '../accounts/service.js';
import { MailService } from '../accounts/mail.js';
import { digest } from '../accounts/crypto.js';
import { TaskService } from './service.js';
import { buildApp } from '../app.js';

let planning: TaskService;
const origin = 'https://accounts.example.test';
const databaseName = `tendly_test_${randomUUID().replaceAll('-', '')}`;
let root: pg.Client;
let pool: pg.Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let service: AccountService;
let app: Awaited<ReturnType<typeof buildApp>>;
const userA = randomUUID(), userB = randomUUID(), deployer = randomUUID();
const householdA = randomUUID(), householdB = randomUUID();
let sessionA: string, sessionB: string;
const headers = (session: string) => ({ origin, cookie: `__Host-tendly=${session}`, 'content-type': 'application/json' });

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required');
  root = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await root.connect();
  await root.query(`CREATE DATABASE "${databaseName}"`);
  const url = new URL(process.env.TEST_DATABASE_URL); url.pathname = `/${databaseName}`;
  await migrateDatabase(url.toString());
  pool = new pg.Pool({ connectionString: url.toString() });
  db = drizzle(pool, { schema });
  service = new AccountService(db, origin);
  planning = new TaskService(db);
  const first = await service.createBootstrap();
  const replacement = await service.createBootstrap();
  await expect(service.validToken(digest(first))).rejects.toThrow('invalid_or_expired_link');
  expect((await service.validToken(digest(replacement))).purpose).toBe('bootstrap');
  await db.insert(schema.users).values([
    { id: userA, email: 'a@example.test', name: 'A', emailVerifiedAt: new Date() },
    { id: userB, email: 'b@example.test', name: 'B', emailVerifiedAt: new Date() },
    { id: deployer, email: 'owner@example.test', name: 'Owner', deploymentAdmin: true },
  ]);
  await db.insert(schema.households).values([{ id: householdA, name: 'A', timezone: 'Europe/Stockholm' }, { id: householdB, name: 'B', timezone: 'UTC' }]);
  await db.insert(schema.memberships).values([{ householdId: householdA, userId: userA, role: 'admin' }, { householdId: householdB, userId: userB, role: 'member' }]);
  sessionA = await service.session(db, userA); sessionB = await service.session(db, userB);
  app = await buildApp({ checkDatabase: async () => {}, accounts: { service, mail: new MailService(db, 'ab'.repeat(32), origin, async () => {}) } });
}, 30000);
afterAll(async () => {
  await app?.close(); await pool?.end();
  if (root) { await root.query(`DROP DATABASE IF EXISTS "${databaseName}"`); await root.end(); }
});
it('scopes every task/entity request and rejects foreign references and CSRF', async () => {
  const actor = (await service.findSession(sessionA))!;
  const foreign = await planning.entityWrite((await service.findSession(sessionB))!, householdB, { name: 'Other home', kind: 'epic' });
  const task = await planning.create(actor, householdA, { title: 'Own task' });
  const base = '/api/v1/households/' + householdA;
  for (const path of ['/tasks', '/tasks/' + task.id, '/entities', '/planning-settings']) {
    expect((await app.inject({ url: base + path, headers: headers(sessionB) })).statusCode).toBe(404);
    expect((await app.inject({ url: base + path })).statusCode).toBe(401);
  }
  await expect(planning.create(actor, householdA, { title: 'Foreign', epicId: foreign.id })).rejects.toThrow('invalid_task_reference');
  await expect(planning.patch(actor, householdA, task.id, 1, { assignees: [userB] })).rejects.toThrow('invalid_task_reference');
  expect((await app.inject({ method: 'PATCH', url: base + '/tasks/' + task.id, headers: headers(sessionB), payload: { baseVersion: 1, changes: { title: 'Attack' } } })).statusCode).toBe(404);
  expect((await app.inject({ method: 'POST', url: base + '/tasks', headers: { ...headers(sessionA), origin: 'https://evil.test' }, payload: { title: 'Attack' } })).statusCode).toBe(403);
});
it('merges different fields but refuses same-field races, stale Undo, and logical date conflicts', async () => {
  const actor = (await service.findSession(sessionA))!;
  const task = await planning.create(actor, householdA, { title: 'Original', column: 'within_year' });
  const results = await Promise.all([
    planning.patch(actor, householdA, task.id, 1, { title: 'Edited' }),
    planning.patch(actor, householdA, task.id, 1, { high: true }),
  ]);
  expect(results.at(-1)?.version).toBeGreaterThan(1);
  const current = await planning.get(db, householdA, task.id, 'Europe/Stockholm');
  expect(current).toMatchObject({ title: 'Edited', high: true });
  const races = await Promise.allSettled(['First', 'Second'].map(title => planning.patch(actor, householdA, task.id, current.version, { title })));
  expect(races.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  await expect(planning.patch(actor, householdA, task.id, current.version, { title: 'Original' })).rejects.toThrow('task_conflict');
  const dates = await planning.patch(actor, householdA, task.id, current.version, { startDate: '2030-01-01' });
  await expect(planning.patch(actor, householdA, task.id, current.version, { startTime: '09:00' })).rejects.toThrow('task_conflict');
  await expect(planning.patch(actor, householdA, task.id, dates.version, { column: 'in_progress' })).rejects.toThrow('confirm_unavailable');
  const started = await planning.patch(actor, householdA, task.id, dates.version, { column: 'in_progress' }, true);
  const done = await planning.patch(actor, householdA, task.id, started.version, { column: 'done' });
  const reopened = await planning.patch(actor, householdA, task.id, done.version, { column: 'reopen' }, true);
  expect(reopened.column).toBe('in_progress');
  expect(reopened.completedAt).toBeNull();
});
it('filters before pagination, suggests only empty sizes, and preserves tasks after entity deletion', async () => {
  const actor = (await service.findSession(sessionA))!;
  const epic = await planning.entityWrite(actor, householdA, { kind: 'epic', name: 'House', color: 'red' });
  const task = await planning.create(actor, householdA, { title: 'Ready', column: 'todo', epicId: epic.id, estimateMinutes: 480 });
  expect(task.size).toBe('M');
  const edited = await planning.patch(actor, householdA, task.id, task.version, { estimateMinutes: 1 });
  expect(edited.size).toBe('M');
  await expect(planning.create(actor, householdA, { title: 'Future', column: 'in_progress', startDate: '2099-01-01' })).rejects.toThrow('confirm_unavailable');
  await planning.create(actor, householdA, { title: 'Later', column: 'todo', startDate: '2099-01-01' });
  const page = await planning.list(actor, householdA, 'now', 0, 1);
  expect(page.items.map(t => t.id)).toEqual([task.id]);
  expect(page.nextOffset).toBeNull();
  await planning.entityDelete(actor, householdA, epic.id, epic.version);
  expect(await planning.get(db, householdA, task.id, 'Europe/Stockholm')).toMatchObject({ title: 'Ready', epicId: null });
  await expect(planning.patch(actor, householdA, task.id, edited.version, { epicId: epic.id })).rejects.toThrow('task_conflict');
  await expect(planning.updateSettings((await service.findSession(sessionB))!, householdB, 0, [30, 60, 120, 240])).rejects.toThrow('household_admin_required');
});
it('releases a removed member’s assignments without allowing stale editors to restore them', async () => {
  const actor = (await service.findSession(sessionA))!;
  await db.insert(schema.memberships).values({ householdId: householdA, userId: userB, role: 'member' });
  const task = await planning.create(actor, householdA, { title: 'Assigned', assignees: [userB] });
  await service.changeMember(actor, { id: householdA, userId: userB }, null);
  expect((await planning.get(db, householdA, task.id, 'Europe/Stockholm')).assignees).toEqual([]);
  await expect(planning.patch(actor, householdA, task.id, task.version, { assignees: [userB] })).rejects.toThrow('task_conflict');
  expect((await planning.patch(actor, householdA, task.id, task.version, { title: 'Still editable' })).title).toBe('Still editable');
});
