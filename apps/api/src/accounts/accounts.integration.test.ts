import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { migrateDatabase } from '../db/migrate.js';
import { AccountService } from './service.js';
import { MailService } from './mail.js';
import { digest } from './crypto.js';
import { buildApp } from '../app.js';

const origin = 'https://accounts.example.test';
const databaseName = `tendly_test_${randomUUID().replaceAll('-', '')}`;
let root: pg.Client;
let pool: pg.Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let service: AccountService;
let app: Awaited<ReturnType<typeof buildApp>>;
const userA = randomUUID(), userB = randomUUID(), deployer = randomUUID();
const householdA = randomUUID(), householdB = randomUUID();
let sessionA: string, sessionB: string, deploymentSession: string;
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
  sessionA = await service.session(db, userA); sessionB = await service.session(db, userB); deploymentSession = await service.session(db, deployer);
  app = await buildApp({ checkDatabase: async () => {}, accounts: { service, mail: new MailService(db, 'ab'.repeat(32), origin, async () => {}) } });
}, 30000);
afterAll(async () => {
  await app?.close(); await pool?.end();
  if (root) { await root.query(`DROP DATABASE IF EXISTS "${databaseName}"`); await root.end(); }
});
it('denies cross-household access, foreign websocket subscriptions, and deployment privilege escalation', async () => {
  expect((await app.inject({ url: `/api/v1/households/${householdB}/members`, headers: headers(sessionA) })).statusCode).toBe(404);
  expect((await app.inject({ url: '/api/v1/settings/smtp', headers: headers(sessionA) })).statusCode).toBe(403);
  expect((await app.inject({ url: `/api/v1/households/${householdA}/members`, headers: headers(deploymentSession) })).statusCode).toBe(404);
  expect((await app.inject({ method: 'POST', url: `/api/v1/households/${householdB}/invitations`, headers: headers(sessionB), payload: { email: 'other@example.test', role: 'admin' } })).statusCode).not.toBe(200);
  await expect(app.injectWS(`/api/v1/households/${householdB}/events`, { headers: headers(sessionA), socket: { remoteAddress: '127.0.0.1' } })).rejects.toThrow();
  const socket = await app.injectWS(`/api/v1/households/${householdA}/events`, { headers: headers(sessionA), socket: { remoteAddress: '127.0.0.1' } });
  socket.close();
  // Existing sockets must lose access too, not only newly authenticated requests.
  const temporarySession = await service.session(db, userA);
  const revoked = await app.injectWS(`/api/v1/households/${householdA}/events`, { headers: headers(temporarySession), socket: { remoteAddress: '127.0.0.1' } });
  const closed = new Promise<number>(resolve => revoked.once('close', code => resolve(code)));
  await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: headers(temporarySession), payload: {} });
  expect(await closed).toBe(1008);
  expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { ...headers(sessionA), origin: 'https://attacker.test' }, payload: {} })).statusCode).toBe(403);
});
it('issues single-use 30-minute invitation codes without SMTP or email verification', async () => {
  const payload = { email: 'unverified@example.test', role: 'member' };
  const path = '/api/v1/households/' + householdA + '/invitation-codes';
  expect((await app.inject({ method: 'POST', url: path, headers: headers(sessionB), payload })).statusCode).toBe(404);
  expect((await app.inject({ method: 'POST', url: path, headers: headers(deploymentSession), payload })).statusCode).toBe(404);
  const started = Date.now();
  const issued = await app.inject({ method: 'POST', url: path, headers: headers(sessionA), payload });
  expect(issued.statusCode).toBe(200);
  const { code, expiresAt } = issued.json<{ code: string; expiresAt: string }>();
  expect(Date.parse(expiresAt) - started).toBeGreaterThanOrEqual(30 * 60_000);
  expect(Date.parse(expiresAt) - Date.now()).toBeLessThanOrEqual(30 * 60_000);
  const token = await service.validToken(digest(code));
  expect(token.verifiesEmail).toBe(false);
  expect(token.id).not.toBe(code);
  const id = randomUUID();
  await db.insert(schema.users).values({ id, name: 'Code recipient', email: payload.email });
  const bearer = await service.session(db, id);
  const redeem = () => app.inject({ method: 'POST', url: '/api/v1/auth/invitations/accept', headers: headers(bearer), payload: { token: code } });
  expect((await Promise.all([redeem(), redeem()])).map(r => r.statusCode).sort()).toEqual([200, 400]);
  expect((await service.findSession(bearer))!.user.emailVerifiedAt).toBeNull();
  expect(await service.createRecovery(payload.email)).toBeNull();
  const expired = await app.inject({ method: 'POST', url: path, headers: headers(sessionA), payload });
  const expiredCode = expired.json<{ code: string }>().code;
  await db.update(schema.tokens).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(schema.tokens.id, digest(expiredCode)));
  expect((await app.inject({ method: 'POST', url: '/api/v1/auth/invitations/accept', headers: headers(bearer), payload: { token: expiredCode } })).statusCode).toBe(400);
  await expect(service.registrationOptions({ flow: 'invite', token: expiredCode, name: 'Late' }, null, randomUUID())).rejects.toThrow('invalid_or_expired_link');
});
it('protects SMTP secrets at rest and in API responses', async () => {
  const response = await app.inject({ method: 'PUT', url: '/api/v1/settings/smtp', headers: headers(deploymentSession), payload: { host: 'mail.example.test', port: 587, security: 'starttls', username: 'sender', password: 'not-a-real-password', sender: 'sender@example.test' } });
  expect(response.statusCode).toBe(200);
  const [stored] = await db.select().from(schema.smtpSettings);
  expect(stored!.encrypted).not.toContain('not-a-real-password');
  const read = await app.inject({ url: '/api/v1/settings/smtp', headers: headers(deploymentSession) });
  expect(read.statusCode).toBe(200);
  expect(read.json()).not.toHaveProperty('password');
  expect(read.body).not.toContain('not-a-real-password');
  const denied = await app.inject({ method: 'PUT', url: '/api/v1/settings/smtp', headers: headers(sessionA), payload: { host: 'evil.example.test', port: 587, security: 'starttls', username: '', sender: 'sender@example.test' } });
  expect(denied.statusCode).toBe(403);
});
it('consumes invitation links once, binds them to the intended account, and rejects expired links', async () => {
  const raw = randomUUID().repeat(2);
  await db.insert(schema.tokens).values({ id: digest(raw), purpose: 'invite', email: 'b@example.test', householdId: householdA, role: 'member', expiresAt: new Date(Date.now() + 60_000) });
  const wrong = await app.inject({ method: 'POST', url: '/api/v1/auth/invitations/accept', headers: headers(sessionA), payload: { token: raw } });
  expect(wrong.statusCode).toBe(403);
  const results = await Promise.all([1, 2].map(() => app.inject({ method: 'POST', url: '/api/v1/auth/invitations/accept', headers: headers(sessionB), payload: { token: raw } })));
  expect(results.map((response) => response.statusCode).sort()).toEqual([200, 400]);
  const expired = randomUUID().repeat(2);
  await db.insert(schema.tokens).values({ id: digest(expired), purpose: 'recovery', userId: userB, expiresAt: new Date(0) });
  await expect(service.validToken(digest(expired))).rejects.toThrow('invalid_or_expired_link');
  await expect(service.createBootstrap()).rejects.toThrow('setup_already_complete');
});
it('uses generic recovery responses and rejects forged registration without creating an account', async () => {
  const known = await app.inject({ method: 'POST', url: '/api/v1/auth/recovery', headers: { origin }, payload: { email: 'a@example.test' } });
  const missing = await app.inject({ method: 'POST', url: '/api/v1/auth/recovery', headers: { origin }, payload: { email: 'missing@example.test' } });
  expect(known.statusCode).toBe(200); expect(missing.json()).toEqual(known.json());
  const before = await db.select().from(schema.users);
  const forged = await app.inject({ method: 'POST', url: '/api/v1/auth/register/verify', headers: { origin }, payload: { ceremonyId: randomUUID(), response: {}, name: 'Fake' } });
  expect(forged.statusCode).toBe(400);
  expect((await db.select().from(schema.users)).length).toBe(before.length);
});
it('preserves a final administrator and scopes session revocation', async () => {
  const lastAdmin = await app.inject({ method: 'PATCH', url: `/api/v1/households/${householdA}/members/${userA}`, headers: headers(sessionA), payload: { role: 'member' } });
  expect(lastAdmin.statusCode).toBe(409);
  await app.inject({ method: 'DELETE', url: `/api/v1/account/sessions/${digest(sessionB)}`, headers: headers(sessionA), payload: {} });
  expect(await service.findSession(sessionB)).not.toBeNull();
  await app.inject({ method: 'DELETE', url: `/api/v1/account/sessions/${digest(sessionB)}`, headers: headers(sessionB), payload: {} });
  expect(await service.findSession(sessionB)).toBeNull();
  await db.update(schema.sessions).set({ expiresAt: new Date(0) }).where(eq(schema.sessions.id, digest(sessionA)));
  expect((await app.inject({ url: `/api/v1/households/${householdA}/members`, headers: headers(sessionA) })).statusCode).toBe(401);
});
it('keeps validated-user traffic separate and never grants new rate buckets to forged cookies', async () => {
  const responses = await Promise.all(Array.from({ length: 130 }, (_, index) => app.inject({ url: '/api/v1/auth/status', headers: { cookie: '__Host-tendly=forged-' + index } })));
  expect(responses.some(response => response.statusCode === 429)).toBe(true);
  const valid = await service.session(db, userB);
  expect((await app.inject({ url: '/api/v1/auth/status', headers: headers(valid) })).statusCode).toBe(200);
});
