import { eq } from 'drizzle-orm';
import { memberships } from '../accounts/schema.js';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import { householdAccess } from '../accounts/access.js';
import { AccountError } from '../accounts/errors.js';
import type { AccountService } from '../accounts/service.js';

export function registerHouseholdEvents(
  server: FastifyInstance,
  accounts: AccountService,
  cookie: string,
) {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const subscribers = new Set<{
    householdId: string;
    notify: (resource?: string) => void;
    socket: WebSocket;
  }>();
  // REST handlers finish their transactions before responding. No draft or rolled-back
  // state is broadcast, and clients always fetch authoritative data with their own access.
  app.addHook('onResponse', async (request, reply) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method) || reply.statusCode >= 400) return;
    const householdId = /^\/api\/v1\/households\/([0-9a-f-]{36})(?:\/|$)/i.exec(request.url)?.[1];
    if (!householdId) {
      const path = request.url.split('?')[0];
      if (
        ![
          '/api/v1/account',
          '/api/v1/auth/invitations/accept',
          '/api/v1/auth/register/verify',
        ].includes(path ?? '')
      )
        return;
      const setCookie = reply.getHeader('set-cookie');
      const values = Array.isArray(setCookie) ? setCookie : [String(setCookie ?? '')];
      const issued = values.find((value) => String(value).startsWith(cookie + '='));
      const bearer = issued
        ? String(issued)
            .split(';')[0]!
            .slice(cookie.length + 1)
        : request.cookies[cookie];
      const current = await accounts.findSession(bearer);
      if (!current) return;
      const homes = await accounts.db
        .select({ id: memberships.householdId })
        .from(memberships)
        .where(eq(memberships.userId, current.user.id));
      for (const subscriber of subscribers)
        if (homes.some((home) => home.id === subscriber.householdId)) subscriber.notify('members');
      return;
    }
    // These POST endpoints are read-only queries, not mutations. Broadcasting them
    // would make subscribed previews invalidate and refetch themselves indefinitely.
    if (/\/(task-query|search)(?:\?|$)/.test(request.url)) return;
    const parts = request.url.split('?')[0]!.split('/').filter(Boolean);
    const resource =
      parts[6] === 'comments'
        ? 'comments'
        : parts[6] === 'attachments'
          ? 'attachments'
          : (parts[4] ?? 'all');
    for (const subscriber of subscribers)
      if (subscriber.householdId === householdId) subscriber.notify(resource);
  });
  app.addHook('preClose', async () => {
    for (const subscriber of subscribers) subscriber.socket.close(1001, 'Server shutting down');
  });
  app.get(
    '/api/v1/households/:id/events',
    {
      websocket: true,
      schema: { params: z.object({ id: z.uuid() }), hide: true },
      preValidation: async (request) => {
        if (request.headers.origin !== accounts.origin)
          throw new AccountError('invalid_origin', 403);
        await householdAccess(
          accounts.db,
          await accounts.findSession(request.cookies[cookie]),
          request.params.id,
        );
      },
    },
    (socket, request) => {
      let closed = false,
        checking = false;
      const pending = new Set<string>();
      const validate = async (send: boolean) => {
        if (closed) return;
        if (checking) {
          return;
        }
        checking = true;
        try {
          // Never reuse the HTTP request's cached actor: sessions and memberships can
          // be revoked while a socket remains open, including via CLI recovery.
          await householdAccess(
            accounts.db,
            await accounts.findSession(request.cookies[cookie]),
            request.params.id,
          );
          if (send && !closed && socket.readyState === 1) {
            const resources = [...pending];
            pending.clear();
            socket.send(JSON.stringify({ type: 'invalidate', resources }));
          }
        } catch {
          socket.close(1008, 'Access revoked');
        } finally {
          checking = false;
          if (pending.size && !closed && socket.readyState === 1) {
            void validate(true);
          }
        }
      };
      const subscriber = {
        householdId: request.params.id,
        socket,
        notify: (resource = 'all') => {
          pending.add(resource);
          void validate(true);
        },
      };
      subscribers.add(subscriber);
      const timer = setInterval(() => {
        void validate(false);
      }, 15_000);
      timer.unref();
      const cleanup = () => {
        closed = true;
        clearInterval(timer);
        subscribers.delete(subscriber);
      };
      socket.on('close', cleanup);
      socket.on('error', cleanup);
      // Cover mutations between the initial REST read and subscription establishment.
      subscriber.notify();
    },
  );
}
