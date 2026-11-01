import { readFile, mkdtemp, rm, writeFile, utimes, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import { migrateDatabase } from '../db/migrate.js';
import { AccountService } from '../accounts/service.js';
import { MailService } from '../accounts/mail.js';
import { digest } from '../accounts/crypto.js';
import { TaskService } from './service.js';
import { buildApp } from '../app.js';
import { ContentService } from '../content/service.js';
import { FileStore } from '../content/files.js';

let fileRoot: string;
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
  fileRoot = await mkdtemp(join(tmpdir(),'tendly-files-'));
  app = await buildApp({ attachmentRoot:fileRoot, attachmentLimit:100_000, checkDatabase: async () => {}, accounts: { service, mail: new MailService(db, 'ab'.repeat(32), origin, async () => {}) } });
}, 30000);
afterAll(async () => {
  await app?.close(); await pool?.end();
  if(fileRoot) await rm(fileRoot,{recursive:true,force:true});
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

it('pushes committed changes only within the household and closes revoked sessions', async () => {
  const bearer = await service.session(db, userA);
  const socket = await app.injectWS(`/api/v1/households/${householdA}/events`, { headers: headers(bearer), socket: { remoteAddress: '127.0.0.1' } });
  const messages: string[] = [], foreignMessages: string[] = [];
  socket.on('message', value => messages.push(String(value)));
  const foreign = await app.injectWS(`/api/v1/households/${householdB}/events`, { headers: headers(sessionB), socket: { remoteAddress: '127.0.0.1' } });
  foreign.on('message', value => foreignMessages.push(String(value)));
  try {
    await expect.poll(() => messages.length).toBe(1);
    await expect.poll(() => foreignMessages.length).toBe(1);
    const path = `/api/v1/households/${householdA}/tasks`;
    const create = await app.inject({ method: 'POST', url: path, headers: headers(sessionA), payload: { title: 'Live update' } });
    expect(create.statusCode).toBe(200);
    await expect.poll(() => messages.length).toBe(2);
    expect(messages.map(value => JSON.parse(value).type)).toEqual(['invalidate','invalidate']);
    expect(foreignMessages).toHaveLength(1);
    const rejected = await app.inject({ method: 'POST', url: path, headers: headers(sessionA), payload: { title: '' } });
    expect(rejected.statusCode).toBe(400);
    await db.delete(schema.sessions).where(eq(schema.sessions.id, digest(bearer)));
    let closeCode: number | undefined;
    socket.on('close', code => { closeCode = code; });
    await app.inject({ method: 'POST', url: path, headers: headers(sessionA), payload: { title: 'After revocation' } });
    await expect.poll(() => closeCode).toBe(1008);
    expect(messages).toHaveLength(2);
    expect(foreignMessages).toHaveLength(1);
  } finally { socket.close(); foreign.close(); }
});

it('preserves rich content, enforces comment authorship/versioning and scopes search/files', async () => {
 const doc=(text:string)=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]});
 const task=await planning.create((await service.findSession(sessionA))!,householdA,{title:'Content integration'});
 const path=`/api/v1/households/${householdA}/tasks/${task.id}`;
 const rich=await app.inject({method:'PATCH',url:path,headers:headers(sessionA),payload:{baseVersion:task.version,changes:{description:doc('Original <literal> rich description')}}});
 expect(rich.statusCode).toBe(200);
 const comment=await app.inject({method:'POST',url:path+'/comments',headers:headers(sessionA),payload:{body:doc('SearchableNeedle')}});
 expect(comment.statusCode).toBe(200);
 const c=comment.json();
 expect((await app.inject({url:path+'/comments',headers:headers(sessionB)})).statusCode).toBe(404);
 const member=randomUUID();await db.insert(schema.users).values({id:member,email:member+'@example.test',name:'Content member'});
 await db.insert(schema.memberships).values({householdId:householdA,userId:member,role:'member'});
 const memberSession=await service.session(db,member);
 const settingsUrl=`/api/v1/households/${householdA}`;
 const settings={baseName:'A',baseTimezone:'Europe/Stockholm',name:'Content home',timezone:'Europe/Stockholm'};
 expect((await app.inject({method:'PATCH',url:settingsUrl,headers:headers(memberSession),payload:settings})).statusCode).toBe(403);
 expect((await app.inject({method:'PATCH',url:settingsUrl,headers:headers(sessionB),payload:settings})).statusCode).toBe(404);
 expect((await app.inject({method:'PATCH',url:settingsUrl,headers:headers(sessionA),payload:settings})).statusCode).toBe(200);
 expect((await app.inject({method:'PATCH',url:settingsUrl,headers:headers(sessionA),payload:settings})).statusCode).toBe(409);
 expect((await app.inject({method:'PATCH',url:path+'/comments/'+c.id,headers:headers(memberSession),payload:{baseVersion:1,body:doc('Not mine')}})).statusCode).toBe(403);
 const edit=await app.inject({method:'PATCH',url:path+'/comments/'+c.id,headers:headers(sessionA),payload:{baseVersion:1,body:doc('SearchableNeedle edited')}});
 expect(edit.statusCode).toBe(200);
 expect((await app.inject({method:'PATCH',url:path+'/comments/'+c.id,headers:headers(sessionA),payload:{baseVersion:1,deleted:true}})).statusCode).toBe(409);
 const search=await app.inject({url:`/api/v1/households/${householdA}/search?q=SearchableNeedle`,headers:headers(sessionA)});
 expect(search.statusCode).toBe(200);expect(search.json().items).toEqual(expect.arrayContaining([expect.objectContaining({kind:'comment',taskId:task.id})]));
 expect((await app.inject({url:`/api/v1/households/${householdA}/search?q=SearchableNeedle`,headers:headers(sessionB)})).statusCode).toBe(404);
 for(const name of ['photo.png','photo.heic']) {
  const bytes=await readFile(new URL('../../../../tests/fixtures/'+name,import.meta.url));
  const boundary='tendly-test-boundary';
  const payload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const upload=await app.inject({method:'POST',url:path+'/attachments',headers:{...headers(sessionA),'content-type':`multipart/form-data; boundary=${boundary}`},payload});
  expect(upload.statusCode,upload.body).toBe(200);
  const f=upload.json();expect(f.preview).toBe(true);
  const url=`/api/v1/households/${householdA}/attachments/${f.id}`;
  expect((await app.inject({url:url+'/download',headers:headers(sessionA)})).rawPayload).toEqual(bytes);
  const preview=await app.inject({url:url+'/preview',headers:headers(sessionA)});
  expect(preview.statusCode).toBe(200);expect(preview.headers['content-type']).toContain('image/jpeg');
  expect((await app.inject({url:url+'/download',headers:headers(sessionB)})).statusCode).toBe(404);
  const foreignDoc={type:'doc',content:[{type:'image',attrs:{src:url.replace(householdA,householdB)+'/preview'}}]};
  expect((await app.inject({method:'POST',url:path+'/comments',headers:headers(sessionA),payload:{body:foreignDoc}})).statusCode).toBe(400);
 }
 const boundary='oversized';const tooLarge=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="large.txt"\r\n\r\n`),Buffer.alloc(100_001,65),Buffer.from(`\r\n--${boundary}--\r\n`)]);
 expect((await app.inject({method:'POST',url:path+'/attachments',headers:{...headers(sessionA),'content-type':`multipart/form-data; boundary=${boundary}`},payload:tooLarge})).statusCode).toBe(413);
});

it('removes only old orphaned files and preserves committed originals and previews', async () => {
 const store=new FileStore(new ContentService(db),fileRoot);
 const existing=await readdir(fileRoot);
 expect(existing.length).toBeGreaterThan(0);
 const old=new Date(Date.now()-48*3600_000);
 for(const file of existing)await utimes(join(fileRoot,file),old,old);
 const orphan=store.path(randomUUID()),pending=store.path(randomUUID());
 await writeFile(orphan,'interrupted upload');await utimes(orphan,old,old);
 await writeFile(pending,'upload has not committed yet');
 await store.cleanupOrphans();
 const remaining=await readdir(fileRoot);
 expect(remaining).toEqual(expect.arrayContaining(existing));
 expect(remaining).toContain(pending.split('/').at(-1));
 await expect(readFile(orphan)).rejects.toMatchObject({code:'ENOENT'});
});
