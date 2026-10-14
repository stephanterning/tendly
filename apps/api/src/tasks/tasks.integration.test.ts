import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
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
const filesDirectory = join(tmpdir(), databaseName);
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
  app = await buildApp({ filesPath: filesDirectory, checkDatabase: async () => {}, accounts: { service, mail: new MailService(db, 'ab'.repeat(32), origin, async () => {}) } });
}, 30000);
afterAll(async () => {
  await rm(filesDirectory, { recursive: true, force: true });
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
it('resolves deep item inheritance, explicit none/false, dates and independent Now children', async () => {
  const actor = (await service.findSession(sessionA))!;
  const car = await planning.entityWrite(actor, householdA, { kind: 'resource', name: 'Car' });
  const ladder = await planning.entityWrite(actor, householdA, { kind: 'resource', name: 'Ladder' });
  const trailer = await planning.entityWrite(actor, householdA, { kind: 'resource', name: 'Trailer' });
  let parent = await planning.create(actor, householdA, { title: 'Parent', resources: [car.id, ladder.id], high: true, startDate: '2099-01-01', startTime: '09:00', deadlineDate: '2099-01-30', assignees: [userA] });
  const child = await planning.create(actor, householdA, { title: 'Child', parentId: parent.id, column: 'todo', resourceExclusions: [car.id], startDate: null, high: false, deadlineDate: '2099-02-05' });
  expect(child).toMatchObject({ resources: [ladder.id], high: false, startDate: null, available: true, deadlineBeyondParent: true, assignees: [userA] });
  let deep = child;
  for (let i = 0; i < 12; i++) deep = await planning.create(actor, householdA, { title: `Level ${i}`, parentId: deep.id });
  parent = await planning.patch(actor, householdA, parent.id, parent.version, { resources: [car.id, ladder.id, trailer.id] });
  expect((await planning.get(db, householdA, deep.id, 'Europe/Stockholm')).resources.sort()).toEqual([ladder.id, trailer.id].sort());
  parent = await planning.patch(actor, householdA, parent.id, parent.version, { resources: [car.id, trailer.id] });
  expect((await planning.get(db, householdA, deep.id, 'Europe/Stockholm')).resources).toEqual([trailer.id]);
  const now = await planning.list(actor, householdA, 'now', 0, 100);
  expect(now.items.some(t => t.id === child.id)).toBe(true);
  expect(now.items.some(t => t.id === parent.id)).toBe(false);
  const board = await planning.list(actor, householdA, 'board', 0, 100);
  expect(board.items.some(t => t.id === child.id)).toBe(false);
  expect((await planning.list(actor, householdA, 'board', 0, 100, true)).items.some(t => t.id === child.id)).toBe(true);
  const inherited = await planning.patch(actor, householdA, child.id, child.version, { inherit: ['high', 'startDate', 'deadlineDate', 'assignees'] });
  expect(inherited).toMatchObject({ high: true, available: false, deadlineDate: parent.deadlineDate, deadlineBeyondParent: false });
  const none = await planning.patch(actor, householdA, child.id, inherited.version, { deadlineDate: null, assignees: [] });
  expect(none).toMatchObject({ deadlineDate: null, assignees: [] });
  const timed = await planning.patch(actor, householdA, child.id, none.version, { startTime: '10:00' });
  expect(timed).toMatchObject({ startDate: '2099-01-01', startTime: '10:00' });
  expect(timed.local.inherit).not.toContain('startDate');
});
it('rejects cross-household graph edges, ancestry cycles and concurrent dependency cycles', async () => {
  const actor = (await service.findSession(sessionA))!;
  const other = await planning.create((await service.findSession(sessionB))!, householdB, { title: 'Private' });
  const a = await planning.create(actor, householdA, { title: 'Graph A' });
  for (const changes of [{ parentId: other.id }, { blockers: [other.id] }, { related: [other.id] }]) await expect(planning.patch(actor, householdA, a.id, a.version, changes)).rejects.toThrow('invalid_task_reference');
  const b = await planning.create(actor, householdA, { title: 'Graph B' });
  const race = await Promise.allSettled([planning.patch(actor, householdA, a.id, a.version, { blockers: [b.id] }), planning.patch(actor, householdA, b.id, b.version, { blockers: [a.id] })]);
  expect(race.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  const p = await planning.create(actor, householdA, { title: 'Graph parent' });
  const c = await planning.create(actor, householdA, { title: 'Graph child', parentId: p.id });
  await expect(planning.patch(actor, householdA, p.id, p.version, { parentId: c.id })).rejects.toThrow('task_cycle');
  await expect(planning.patch(actor, householdA, p.id, p.version, { blockers: [c.id] })).rejects.toThrow('dependency_cycle');
  const independent = await planning.create(actor, householdA, { title: 'Independent', blockers: [c.id] });
  await expect(planning.patch(actor, householdA, p.id, p.version, { parentId: independent.id })).rejects.toThrow('dependency_cycle');
  const x = await planning.create(actor, householdA, { title: 'Tree X' });
  const y = await planning.create(actor, householdA, { title: 'Tree Y' });
  const treeRace = await Promise.allSettled([planning.patch(actor, householdA, x.id, x.version, { parentId: y.id }), planning.patch(actor, householdA, y.id, y.version, { parentId: x.id })]);
  expect(treeRace.filter(result => result.status === 'fulfilled')).toHaveLength(1);
});
it('counts direct progress but warns for all descendants; availability checks only effective direct blockers', async () => {
  const actor = (await service.findSession(sessionA))!;
  const prerequisite = await planning.create(actor, householdA, { title: 'Prerequisite' });
  const permit = await planning.create(actor, householdA, { title: 'Permit', column: 'done', blockers: [prerequisite.id] });
  const parent = await planning.create(actor, householdA, { title: 'Work', blockers: [permit.id] });
  const child = await planning.create(actor, householdA, { title: 'Child done', parentId: parent.id, column: 'done' });
  const grandchild = await planning.create(actor, householdA, { title: 'Work to do', parentId: child.id, column: 'todo' });
  expect(grandchild.available).toBe(true); // Permit is done even though its own blocker isn't.
  expect(await planning.get(db, householdA, parent.id, 'UTC')).toMatchObject({ progress: { done: 1, total: 1 }, unfinishedDescendants: 1 });
  await expect(planning.patch(actor, householdA, parent.id, parent.version, { column: 'done' })).rejects.toThrow('confirm_descendants');
  const completed = await planning.patch(actor, householdA, parent.id, parent.version, { column: 'done' }, false, true);
  expect(completed.column).toBe('done');
  expect((await planning.get(db, householdA, grandchild.id, 'UTC')).column).toBe('todo');
  let started = await planning.patch(actor, householdA, grandchild.id, grandchild.version, { column: 'in_progress' });
  const reopened = await planning.patch(actor, householdA, permit.id, permit.version, { column: 'todo' });
  expect(reopened.column).toBe('todo');
  expect(await planning.get(db, householdA, started.id, 'UTC')).toMatchObject({ column: 'in_progress', available: false });
  started = await planning.patch(actor, householdA, started.id, started.version, { column: 'todo' });
  await expect(planning.patch(actor, householdA, started.id, started.version, { column: 'in_progress' })).rejects.toThrow('confirm_unavailable');
  expect((await planning.patch(actor, householdA, started.id, started.version, { column: 'in_progress' }, true)).available).toBe(false);
});
it('keeps relations bidirectional and nonblocking, protects peer edits, and preserves deleted blockers', async () => {
  const actor = (await service.findSession(sessionA))!;
  const a = await planning.create(actor, householdA, { title: 'Related A', column: 'todo' });
  const b = await planning.create(actor, householdA, { title: 'Related B' });
  const linked = await planning.patch(actor, householdA, a.id, a.version, { related: [b.id] });
  expect(linked.available).toBe(true);
  expect((await planning.get(db, householdA, b.id, 'UTC')).related).toEqual([a.id]);
  await expect(planning.patch(actor, householdA, b.id, b.version, { related: [] })).rejects.toThrow('task_conflict');
  const blocker = await planning.create(actor, householdA, { title: 'Will be removed', column: 'done' });
  const blocked = await planning.create(actor, householdA, { title: 'Survives deletion', column: 'todo', blockers: [blocker.id] });
  await pool.query('DELETE FROM tasks WHERE id = $1', [blocker.id]);
  expect(await planning.get(db, householdA, blocked.id, 'UTC')).toMatchObject({ available: false, effectiveBlockers: [{ id: blocker.id, title: null, complete: false, inherited: false }] });
  const renamed = await planning.patch(actor, householdA, blocked.id, blocked.version, { title: 'Still editable' });
  expect(renamed.available).toBe(false);
  expect((await planning.patch(actor, householdA, blocked.id, renamed.version, { blockers: [] })).available).toBe(true);
});

it('evaluates shared nested filters on effective values, isolates personal toggles and guards saved revisions', async () => {
  const { PlanningService } = await import('../planning/service.js');
  const { defaultView } = await import('@tendly/shared');
  const saved = new PlanningService(db), actor = (await service.findSession(sessionA))!;
  const home = await planning.entityWrite(actor, householdA, { name: 'Filter home', kind: 'place' });
  const car = await planning.entityWrite(actor, householdA, { name: 'Filter car', kind: 'resource' });
  const trailer = await planning.entityWrite(actor, householdA, { name: 'Filter trailer', kind: 'resource' });
  const parent = await planning.create(actor, householdA, { title: 'Filter parent', resources: [car.id, trailer.id], places: [home.id] });
  const child = await planning.create(actor, householdA, { title: 'Filter child', parentId: parent.id, resourceExclusions: [trailer.id], column: 'todo' });
  const filter = await saved.saveFilter(actor, householdA, { name: 'Feasible at home', icon: 'car', color: 'blue', definition: { type: 'group', operator: 'and', children: [
    { type: 'predicate', field: 'resources', operator: 'feasible', value: [car.id] },
    { type: 'predicate', field: 'places', operator: 'compatible', value: ['$place'] },
  ] } });
  const view = await saved.saveView(actor, householdA, { name: 'Focused view', icon: 'house', color: 'blue', definition: { ...defaultView(true), quickFilters: [filter.id] } });
  await saved.personal(actor, householdA, view.id, { version: 0, activeFilters: [filter.id], favorite: true, currentPlace: home.id });
  const found = await saved.results(actor, householdA, { viewId: view.id, offset: 0, limit: 100 });
  expect(found.items.map(t => t.id)).toContain(child.id);
  expect(found.items.map(t => t.id)).not.toContain(parent.id);
  await saved.saveFilter(actor, householdA, { ...filter, definition: { type: 'predicate', field: 'title', operator: 'eq', value: "' OR TRUE --" } }, filter.id, filter.version);
  expect((await saved.results(actor, householdA, { viewId: view.id, offset: 0, limit: 100 })).count).toBe(0);
  await expect(saved.saveFilter(actor, householdA, filter, filter.id, filter.version)).rejects.toThrow('planning_conflict');
  const history = await saved.history(actor, householdA, filter.id);
  expect(history.map(h => h.version)).toEqual([1, 2]);
  await saved.saveFilter(actor, householdA, { ...filter, definition: history[0]!.definition }, filter.id, 2);
  expect((await saved.results(actor, householdA, { viewId: view.id, offset: 0, limit: 100 })).items.map(t => t.id)).toContain(child.id);
  const other = (await service.findSession(sessionB))!;
  await expect(saved.results(other, householdB, { viewId: view.id, offset: 0, limit: 10 })).rejects.toThrow('view_not_found');
  await expect(saved.personal(other, householdB, view.id, { version: 0, favorite: false, activeFilters: [], currentPlace: null })).rejects.toThrow('view_not_found');
  await db.insert(schema.memberships).values({ householdId: householdA, userId: userB, role: 'member' });
  try {
    const personal = (await saved.library(other, householdA)).personal[view.id]!;
    expect(personal.activeFilters).toEqual([]);
    expect(personal.favorite).toBe(false);
    await expect(saved.personal(actor, householdA, view.id, { ...personal, currentPlace: home.id })).rejects.toThrow('planning_conflict');
  } finally { await db.delete(schema.memberships).where((await import('drizzle-orm')).and((await import('drizzle-orm')).eq(schema.memberships.householdId, householdA), (await import('drizzle-orm')).eq(schema.memberships.userId, userB))); }
  const reordered = await planning.reorder(actor, householdA, child.id, child.version, parent.id);
  expect(reordered.order).toBeLessThan(parent.order);
  await expect(planning.reorder(actor, householdA, child.id, child.version, null)).rejects.toThrow('planning_conflict');
});

it('materializes recurrence once, preserves instance edits and safely restores/deletes task trees', async () => {
  const { TemplateService } = await import('../lifecycle/templates.js');
  const { LifecycleService } = await import('../lifecycle/service.js');
  const { maintainHousehold } = await import('../lifecycle/worker.js');
  const { eq } = await import('drizzle-orm');
  const actor = (await service.findSession(sessionA))!, actorB = (await service.findSession(sessionB))!;
  const templates = new TemplateService(db), lifecycle = new LifecycleService(db);
  const epic = await planning.entityWrite(actor, householdA, { kind: 'epic', name: 'Seasonal work' });
  const root = await planning.create(actor, householdA, { title: 'Winterize', epicId: epic.id, startDate: '2030-10-01', deadlineDate: '2030-10-15' });
  const a = await planning.create(actor, householdA, { title: 'Turn off pump', parentId: root.id });
  await planning.create(actor, householdA, { title: 'Drain pipes', parentId: root.id, blockers: [a.id] });
  const template = await templates.capture(actor, householdA, root.id, 'Winterization', { anchor: '2030-10-01', interval: 1, unit: 'years', leadDays: 14, enabled: true });
  await planning.entityWrite(actor, householdA, { archived: true }, epic.id, epic.version);
  await maintainHousehold(db, householdA, new Date('2030-09-16T12:00Z'));
  expect(await db.select().from(schema.occurrences).where(eq(schema.occurrences.templateId, template.id))).toHaveLength(0);
  await Promise.all([maintainHousehold(db, householdA, new Date('2030-09-17T12:00Z')), maintainHousehold(db, householdA, new Date('2030-09-17T12:00Z'))]);
  const occurrences = await db.select().from(schema.occurrences).where(eq(schema.occurrences.templateId, template.id));
  expect(occurrences).toHaveLength(1);
  const instance = await planning.get(db, householdA, occurrences[0]!.rootId, 'Europe/Stockholm');
  const pump = instance.children.find(c => c.title === 'Turn off pump')!, drain = instance.children.find(c => c.title === 'Drain pipes')!;
  expect((await planning.get(db, householdA, drain.id, 'Europe/Stockholm')).blockers).toEqual([pump.id]);
  expect(instance.epicId).toBe(epic.id);
  await planning.entityWrite(actor, householdA, { archived: false }, epic.id, epic.version + 1);
  await templates.save(actor, householdA, { ...template, name: 'Updated series', nodes: template.nodes.map(n => ({ ...n, value: { ...n.value, title: n.value.title + ' future' } })) }, template.id, template.version);
  expect((await planning.get(db, householdA, instance.id, 'Europe/Stockholm')).title).toBe('Winterize');
  await expect(templates.createInstance(actorB, householdB, template.id, '2030-10-01')).rejects.toThrow('template_not_found');
  const completed = await planning.patch(actor, householdA, root.id, root.version, { column: 'done' }, false, true);
  await db.update(schema.tasks).set({ completedAt: new Date('2020-01-01') }).where(eq(schema.tasks.id, root.id));
  await maintainHousehold(db, householdA, new Date('2030-09-17T12:00Z'));
  expect((await db.select().from(schema.tasks).where(eq(schema.tasks.id, root.id)))[0]!.archivedAt).toBeNull();
  await lifecycle.change(actor, householdA, root.id, completed.version, 'trash', true);
  expect((await lifecycle.list(actor, householdA, 'trash')).filter(t => [root.id, a.id].includes(t.id))).toHaveLength(2);
  const trashed = (await lifecycle.list(actor, householdA, 'trash')).find(t => t.id === root.id)!;
  await lifecycle.change(actor, householdA, root.id, trashed.version, 'restore', false);
  expect((await planning.get(db, householdA, root.id, 'Europe/Stockholm')).children).toHaveLength(2);
  const blocker = await planning.create(actor, householdA, { title: 'Disposable blocker', column: 'done' });
  const dependent = await planning.create(actor, householdA, { title: 'Keep dependent', blockers: [blocker.id] });
  await expect(lifecycle.change(actor, householdA, blocker.id, blocker.version, 'delete', false)).rejects.toThrow('confirm_dependent_deletion');
  await lifecycle.change(actor, householdA, blocker.id, blocker.version, 'delete', true);
  expect((await planning.get(db, householdA, dependent.id, 'Europe/Stockholm')).available).toBe(false);
  await planning.entityDelete(actor, householdA, epic.id, epic.version + 2);
  expect((await templates.createInstance(actor, householdA, template.id, '2031-10-01')).epicId).toBeNull();
});

it('keeps rich content and downloads household-scoped, protects comment authors and searches comment text', async () => {
  const { ContentService } = await import('../content/service.js');
  const content = new ContentService(db, filesDirectory), actor = (await service.findSession(sessionA))!, other = (await service.findSession(sessionB))!;
  const task = await planning.create(actor, householdA, { title: 'Photo and notes' });
  const body = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Remember the brass fitting', marks: [{ type: 'bold' }] }] }] });
  await content.comment(actor, householdA, task.id, body);
  const saved = (await content.list(actor, householdA, task.id)).comments[0]!;
  await expect(content.comment(other, householdB, task.id, body)).rejects.toThrow('task_not_found');
  await db.insert(schema.memberships).values({ householdId: householdA, userId: userB, role: 'member' });
  await expect(content.comment(other, householdA, task.id, 'Changed', saved.id, saved.version)).rejects.toThrow('comment_author_required');
  await expect(content.removeComment(other, householdA, saved.id, saved.version)).rejects.toThrow('comment_author_required');
  await content.comment(actor, householdA, task.id, body, saved.id, saved.version);
  await expect(content.comment(actor, householdA, task.id, 'Stale', saved.id, saved.version)).rejects.toThrow('planning_conflict');
  const unsafe = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] });
  await expect(planning.patch(actor, householdA, task.id, task.version, { description: unsafe })).rejects.toThrow('invalid_rich_text');
  const file = await content.upload(actor, householdA, task.id, { name: 'sample.png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' });
  expect(file.mime).toBe('image/png');
  const response = await app.inject({ url: `/api/v1/households/${householdA}/files/${file.id}`, headers: headers(sessionA) });
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect((await app.inject({ url: `/api/v1/households/${householdB}/files/${file.id}`, headers: headers(sessionB) })).statusCode).toBe(404);
  expect((await app.inject({ url: `/api/v1/households/${householdA}/files/${file.id}` })).statusCode).toBe(401);
  const search = await app.inject({ method: 'POST', url: `/api/v1/households/${householdA}/search`, headers: headers(sessionA), payload: { query: 'brass fitting', definition: null, currentPlace: null } });
  expect(search.statusCode).toBe(200);
  expect(search.json().tasks.map((result: { task: { id: string } }) => result.task.id)).toContain(task.id);
  const imageDescription = JSON.stringify({ type: 'doc', content: [{ type: 'image', attrs: { src: `/api/v1/households/${householdA}/files/${file.id}`, alt: 'Inspection', title: null, width: null, height: null } }] });
  const withImage = await planning.patch(actor, householdA, task.id, task.version, { description: imageDescription });
  await expect(content.removeFile(actor, householdA, file.id)).rejects.toThrow('file_in_use');
  const { TemplateService } = await import('../lifecycle/templates.js');
  const { LifecycleService } = await import('../lifecycle/service.js');
  const templates = new TemplateService(db), template = await templates.capture(actor, householdA, task.id, 'Keep illustration', null);
  await new LifecycleService(db).change(actor, householdA, task.id, withImage.version, 'delete', true);
  const copy = await templates.createInstance(actor, householdA, template.id, '2030-10-01');
  expect(copy.description).toBe(imageDescription);
  expect((await content.download(actor, householdA, file.id)).bytes.length).toBeGreaterThan(0);

});
