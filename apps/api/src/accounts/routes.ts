import { saveAvatar, readAvatar } from './avatar.js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { z } from 'zod';
import { and, eq, gt } from 'drizzle-orm';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
import { emailSchema, errorSchema, timezoneSchema, nameSchema, okSchema, registrationInput, roleSchema, sessionSchema, smtpSchema, verificationInput } from '@tendly/shared';
import { AccountService } from './service.js';
import { MailService } from './mail.js';
import { AccountError } from './errors.js';
import { accountView, deploymentAdmin, householdAccess, lockAccounts, recent, signedIn } from './access.js';
import { credentials, households, memberships, securityEvents, sessions, tokens, users } from './schema.js';
import { digest, randomToken } from './crypto.js';

const ok = { ok: true as const };
const envelope = z.object({ ceremonyId: z.uuid(), options: z.record(z.string(), z.unknown()) });
const idParam = z.object({ id: z.uuid() });
const memberParam = z.object({ id: z.uuid(), userId: z.uuid() });
const linkInput = z.object({ token: z.string().min(20).max(128) });

export async function registerAccountRoutes(server: FastifyInstance, service: AccountService, mail: MailService, filesPath = '/data/attachments') {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const db = service.db;
  const secure = new URL(service.origin).protocol === 'https:';
  const sessionName = secure ? '__Host-tendly' : 'tendly_session';
  const ceremonyName = secure ? '__Host-tendly-ceremony' : 'tendly_ceremony';
  const cookieOptions = { path: '/', httpOnly: true, secure, sameSite: 'lax' as const };
  await app.register(cookie);
  const actors = new WeakMap<FastifyRequest, ReturnType<typeof service.findSession>>();
  const actor = (request: FastifyRequest) => {
    let found = actors.get(request);
    if (!found) { found = service.findSession(request.cookies[sessionName]); actors.set(request, found); }
    return found;
  };
  // Autosave/refetch traffic must not consume another household member's allowance.
  // Only a validated session gets a user bucket; arbitrary cookies cannot evade IP limits.
  await app.register(rateLimit, {
    hook: 'preHandler', timeWindow: '1 minute',
    max: async request => (await actor(request)) ? 300 : 120,
    keyGenerator: async request => { const current = await actor(request); return current ? 'user:' + current.user.id : 'ip:' + request.ip; },
  });
  await app.register(websocket);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (request.headers.origin !== service.origin) throw new AccountError('invalid_origin', 403);
      if (!request.headers['content-type']?.startsWith('application/json')) throw new AccountError('json_required', 415);
    }
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AccountError) return reply.code(error.statusCode).send({ error: error.code });
    if (error && typeof error === 'object' && 'validation' in error && error.validation) return reply.code(400).send({ error: 'invalid_input' });
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 429) return reply.code(429).send({ error: 'too_many_requests' });
    request.log.error({ code: 'account_operation_failed' }, 'Account operation failed');
    return reply.code(500).send({ error: 'operation_failed' });
  });
  const setSession = async (reply: FastifyReply, request: FastifyRequest, bearer: string) => {
    // Rotate the caller's old session on successful authentication/enrollment.
    const old = request.cookies[sessionName];
    if (old) await db.delete(sessions).where(eq(sessions.id, digest(old)));
    reply.setCookie(sessionName, bearer, { ...cookieOptions, maxAge: 30 * 24 * 3600 });
    reply.clearCookie(ceremonyName, cookieOptions);
  };
  const startBinding = (reply: FastifyReply) => {
    const binding = randomToken();
    reply.setCookie(ceremonyName, binding, { ...cookieOptions, sameSite: 'strict', maxAge: 300 });
    return binding;
  };
  app.addHook('onRoute', (route) => {
    route.schema ??= {};
    route.schema.response = { 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema, 429: errorSchema, 500: errorSchema, 503: errorSchema, ...(typeof route.schema.response === 'object' ? route.schema.response : {}) };
  });
  const authLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } };
  app.get('/api/v1/auth/status', { schema: { response: { 200: z.object({ initialized: z.boolean(), emailAvailable: z.boolean() }) } } }, async () => ({ initialized: await service.initialized(), emailAvailable: !!(await mail.config()) }));
  app.get('/api/v1/auth/session', { schema: { response: { 200: sessionSchema } } }, async (request) => {
    const current = await actor(request);
    return { account: current ? await accountView(db, current) : null };
  });
  app.post('/api/v1/auth/register/options', { config: authLimit, schema: { body: registrationInput, response: { 200: envelope } } }, async (request, reply) => service.registrationOptions(request.body, await actor(request), startBinding(reply)));
  app.post('/api/v1/auth/register/verify', { config: authLimit, schema: { body: verificationInput, response: { 200: okSchema } } }, async (request, reply) => {
    const bearer = await service.finishRegistration(request.body.ceremonyId, request.cookies[ceremonyName] ?? '', request.body.response as unknown as RegistrationResponseJSON, request.body.name, await actor(request));
    await setSession(reply, request, bearer);
    return ok;
  });
  app.post('/api/v1/auth/login/options', { config: authLimit, schema: { body: z.object({}), response: { 200: envelope } } }, async (request, reply) => service.loginOptions(startBinding(reply), await actor(request)));
  app.post('/api/v1/auth/login/verify', { config: authLimit, schema: { body: verificationInput, response: { 200: okSchema } } }, async (request, reply) => {
    const bearer = await service.finishLogin(request.body.ceremonyId, request.cookies[ceremonyName] ?? '', request.body.response as unknown as AuthenticationResponseJSON);
    await setSession(reply, request, bearer);
    return ok;
  });
  app.post('/api/v1/auth/logout', { schema: { body: z.object({}), response: { 200: okSchema } } }, async (request, reply) => {
    const value = request.cookies[sessionName];
    if (value) await db.delete(sessions).where(eq(sessions.id, digest(value)));
    reply.clearCookie(sessionName, cookieOptions);
    return ok;
  });
  app.post('/api/v1/auth/recovery', {
    config: { rateLimit: { max: 3, timeWindow: '15 minutes', keyGenerator: (request: FastifyRequest) => {
      const body = request.body as { email?: string } | undefined;
      return digest(body?.email?.trim().toLowerCase() ?? request.ip);
    } } }, schema: { body: z.object({ email: emailSchema }), response: { 200: okSchema } },
  }, async (request) => {
    // Always the same response, including for an unavailable mailbox or SMTP failure.
    const token = await service.createRecovery(request.body.email);
    if (token) {
      try { await mail.queueRecovery(request.body.email, token); }
      catch { await db.delete(tokens).where(eq(tokens.id, digest(token))); }
    }
    return ok;
  });
  app.post('/api/v1/auth/verify-email/request', { config: { rateLimit: { max: 3, timeWindow: '15 minutes' } }, schema: { body: z.object({}), response: { 200: okSchema } } }, async (request) => {
    const current = await actor(request); signedIn(current);
    if (current.user.emailVerifiedAt) return ok;
    const token = randomToken();
    await db.insert(tokens).values({ id: digest(token), purpose: 'verify_email', userId: current.user.id, email: current.user.email, expiresAt: new Date(Date.now() + 3600_000) });
    try { await mail.sendToken(current.user.email, token, 'verify_email'); }
    catch (error) { await db.delete(tokens).where(eq(tokens.id, digest(token))); throw error; }
    return ok;
  });
  app.post('/api/v1/auth/verify-email', { schema: { body: linkInput, response: { 200: okSchema } } }, async (request) => {
    await db.transaction(async (tx) => {
      await lockAccounts(tx);
      const token = await service.validToken(digest(request.body.token), tx);
      if (token.purpose !== 'verify_email' || !token.userId) throw new AccountError('invalid_or_expired_link');
      await tx.update(users).set({ emailVerifiedAt: new Date() }).where(and(eq(users.id, token.userId), eq(users.email, token.email!)));
      await tx.update(tokens).set({ usedAt: new Date() }).where(eq(tokens.id, token.id));
    });
    return ok;
  });
  app.post('/api/v1/auth/invitations/accept', { schema: { body: linkInput, response: { 200: okSchema } } }, async (request) => {
    const current = await actor(request); signedIn(current);
    await service.acceptInvite(request.body.token, current);
    return ok;
  });
  app.patch('/api/v1/account', { schema: { body: z.object({ name: nameSchema, language: z.enum(['en', 'sv']), theme: z.enum(['system', 'light', 'dark']) }), response: { 200: okSchema } } }, async (request) => {
    const current = await actor(request); signedIn(current);
    await db.update(users).set(request.body).where(eq(users.id, current.user.id));
    return ok;
  });
  app.put('/api/v1/account/avatar', { schema: { body: z.object({ image: z.string().max(200000).nullable() }), response: { 200: okSchema } } }, async request => {
    const current = await actor(request); signedIn(current);
    await saveAvatar(db, current, filesPath, request.body.image);
    return ok;
  });
  app.get('/api/v1/avatars/:id', { schema: { params: idParam } }, async (request, reply) => {
    const current = await actor(request); signedIn(current);
    const bytes = await readAvatar(db, current, filesPath, request.params.id);
    return reply.header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff').type('image/jpeg').send(bytes);
  });
  app.get('/api/v1/account/passkeys', { schema: { response: { 200: z.array(z.object({ id: z.string(), name: z.string(), createdAt: z.string() })) } } }, async (request) => {
    const current = await actor(request); signedIn(current);
    const rows = await db.select({ id: credentials.id, name: credentials.name, createdAt: credentials.createdAt }).from(credentials).where(eq(credentials.userId, current.user.id));
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  });
  app.delete('/api/v1/account/passkeys/:keyId', { schema: { params: z.object({ keyId: z.string().max(2048) }), body: z.object({}), response: { 200: okSchema } } }, async (request) => {
    const current = await actor(request); recent(current);
    await service.removePasskey(current, request.params.keyId);
    return ok;
  });
  app.get('/api/v1/account/sessions', { schema: { response: { 200: z.array(z.object({ id: z.string(), current: z.boolean(), createdAt: z.string(), expiresAt: z.string() })) } } }, async (request) => {
    const current = await actor(request); signedIn(current);
    return (await db.select().from(sessions).where(and(eq(sessions.userId, current.user.id), gt(sessions.expiresAt, new Date())))).map((row) => ({ id: row.id, current: row.id === current.session.id, createdAt: row.authenticatedAt.toISOString(), expiresAt: row.expiresAt.toISOString() }));
  });
  app.delete('/api/v1/account/sessions/:sessionId', { schema: { params: z.object({ sessionId: z.string().length(64) }), body: z.object({}), response: { 200: okSchema } } }, async (request) => {
    const current = await actor(request); signedIn(current);
    await db.delete(sessions).where(and(eq(sessions.id, request.params.sessionId), eq(sessions.userId, current.user.id)));
    return ok;
  });
  app.get('/api/v1/households/:id/members', { schema: { params: idParam, response: { 200: z.array(z.object({ id: z.uuid(), name: z.string(), avatar: z.string().nullable(), email: z.string(), role: roleSchema })) } } }, async (request) => {
    const current = await actor(request);
    await householdAccess(db, current, request.params.id);
    const rows = await db.select({ id: users.id, avatar: users.avatar, name: users.name, email: users.email, role: memberships.role }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.householdId, request.params.id));
    return rows.map(row => ({ ...row, avatar: row.avatar ? '/api/v1/avatars/' + row.avatar : null }));
  });
  app.post('/api/v1/households/:id/invitations', { schema: { params: idParam, body: z.object({ email: emailSchema, role: roleSchema }), response: { 200: okSchema } } }, async (request) => {
    const current = await actor(request); recent(current);
    await householdAccess(db, current, request.params.id, true);
    if (!await mail.config()) throw new AccountError('smtp_not_configured', 503);
    const { token } = await service.createInvitation(current, request.params.id, request.body.email, request.body.role, 'email');
    try { await mail.sendToken(request.body.email, token, 'invite'); }
    catch (error) { await db.delete(tokens).where(eq(tokens.id, digest(token))); throw error; }
    return ok;
  });
  app.post('/api/v1/households/:id/invitation-codes', {
    config: authLimit,
    schema: { params: idParam, body: z.object({ email: emailSchema, role: roleSchema }), response: { 200: z.object({ code: z.string(), expiresAt: z.string() }) } },
  }, async (request) => {
    const current = await actor(request); recent(current);
    const invitation = await service.createInvitation(current, request.params.id, request.body.email, request.body.role, 'code');
    return { code: invitation.token, expiresAt: invitation.expiresAt.toISOString() };
  });
  const changeMember = async (request: FastifyRequest, params: { id: string; userId: string }, role: 'admin' | 'member' | null) => {
    const current = await actor(request); recent(current);
    await service.changeMember(current, params, role);
    return ok;
  };
  app.patch('/api/v1/households/:id/members/:userId', { schema: { params: memberParam, body: z.object({ role: roleSchema }), response: { 200: okSchema } } }, (request) => changeMember(request, request.params, request.body.role));
  app.delete('/api/v1/households/:id/members/:userId', { schema: { params: memberParam, body: z.object({}), response: { 200: okSchema } } }, (request) => changeMember(request, request.params, null));
  app.post('/api/v1/households/:id/members/:userId/recovery', { config: { rateLimit: { max: 3, timeWindow: '15 minutes' } }, schema: { params: memberParam, body: z.object({}), response: { 200: okSchema } } }, async (request) => {
    const current = await actor(request); recent(current);
    await householdAccess(db, current, request.params.id, true);
    const [member] = await db.select({ email: users.email, verified: users.emailVerifiedAt }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.householdId, request.params.id), eq(memberships.userId, request.params.userId)));
    if (!member) throw new AccountError('member_not_found', 404);
    if (!member.verified) throw new AccountError('verified_email_required', 409);
    const token = await service.createRecovery(member.email, current.user.id);
    if (token) {
      try { await mail.sendToken(member.email, token, 'recovery'); }
      catch (error) { await db.delete(tokens).where(eq(tokens.id, digest(token))); throw error; }
    }
    return ok;
  });
  app.get('/api/v1/settings/smtp', { schema: { response: { 200: smtpSchema.omit({ password: true }).extend({ hasPassword: z.boolean() }).nullable() } } }, async (request) => {
    deploymentAdmin(await actor(request));
    return mail.publicConfig();
  });
  app.put('/api/v1/settings/smtp', { schema: { body: smtpSchema, response: { 200: okSchema } } }, async (request) => {
    const current = await actor(request); deploymentAdmin(current);
    await mail.save(request.body);
    await db.insert(securityEvents).values({ actorId: current.user.id, action: 'smtp_configuration_changed' });
    return ok;
  });
  app.post('/api/v1/settings/smtp/test', { schema: { body: z.object({}), response: { 200: okSchema } } }, async (request) => {
    const current = await actor(request); deploymentAdmin(current);
    await mail.send(current.user.email, 'Tendly · Email test', 'Your Tendly email configuration works.');
    return ok;
  });
  app.put('/api/v1/households/:id', { schema: { params: idParam, body: z.object({ name: nameSchema, timezone: timezoneSchema, previousName: z.string(), previousTimezone: z.string() }), response: { 200: okSchema } } }, async request => {
    const current = await actor(request);
    await db.transaction(async tx => {
      await householdAccess(tx, current, request.params.id, true);
      const [old] = await tx.select().from(households).where(eq(households.id, request.params.id)).for('update');
      await householdAccess(tx, current, request.params.id, true);
      if (!old || old.name !== request.body.previousName || old.timezone !== request.body.previousTimezone) throw new AccountError('planning_conflict', 409);
      await tx.update(households).set({ name: request.body.name, timezone: request.body.timezone, revision: old.revision + 1 }).where(eq(households.id, old.id));
    });
    return ok;
  });
  // Authorization happens before upgrade and again while the socket is alive.
  // Future broadcasts must recheck membership before sending household content.
  app.get('/api/v1/households/:id/events', {
    websocket: true, schema: { params: idParam, hide: true },
    preValidation: async (request) => {
      if (request.headers.origin !== service.origin) throw new AccountError('invalid_origin', 403);
      await householdAccess(db, await actor(request), request.params.id);
    },
  }, (socket, request) => {
    let revision = -1, checking = false, lastPing = Date.now();
    const tick = async () => {
      if (checking) return;
      checking = true;
      try {
        // A WebSocket outlives its upgrade request: never reuse the request's cached session.
        const current = await service.findSession(request.cookies[sessionName]);
        await householdAccess(db, current, request.params.id);
        // Idle households still need traffic so reverse proxies keep the upgraded connection alive.
        if (Date.now() - lastPing >= 20_000) { socket.ping(); lastPing = Date.now(); }
        const [household] = await db.select({ revision: households.revision }).from(households).where(eq(households.id, request.params.id));
        if (household && household.revision !== revision) { revision = household.revision; socket.send(JSON.stringify({ type: 'changed', revision })); }
      } catch { socket.close(1008, 'Access revoked'); }
      finally { checking = false; }
    };
    const timer = setInterval(() => { void tick(); }, 2000);
    void tick();
    socket.on('close', () => clearInterval(timer));
    socket.on('error', () => clearInterval(timer));
  });

}
