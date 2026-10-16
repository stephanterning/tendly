import { and, eq, gt, sql } from 'drizzle-orm';
import type { QueryDatabase } from './database.js';
import { households, memberships, sessions, users } from './schema.js';
import { digest } from './crypto.js';
import { AccountError } from './errors.js';

export async function findSession(db: QueryDatabase, bearer?: string) {
  if (!bearer) return null;
  const [row] = await db.select({ user: users, session: sessions }).from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, digest(bearer)), gt(sessions.expiresAt, new Date())));
  return row ?? null;
}
export type Actor = NonNullable<Awaited<ReturnType<typeof findSession>>>;
export function signedIn(actor: Actor | null): asserts actor is Actor {
  if (!actor) throw new AccountError('sign_in_required', 401);
}
export function recent(actor: Actor | null): asserts actor is Actor {
  signedIn(actor);
  if (Date.now() - actor.session.authenticatedAt.getTime() > 10 * 60_000) {
    throw new AccountError('reauthentication_required', 403);
  }
}
export function deploymentAdmin(actor: Actor | null): asserts actor is Actor {
  recent(actor);
  if (!actor.user.deploymentAdmin) throw new AccountError('deployment_admin_required', 403);
}
export async function householdAccess(db: QueryDatabase, actor: Actor | null, householdId: string, admin = false) {
  signedIn(actor);
  const [membership] = await db.select().from(memberships)
    .where(and(eq(memberships.householdId, householdId), eq(memberships.userId, actor.user.id)));
  // Missing and foreign household IDs have the same response: no existence disclosure.
  if (!membership) throw new AccountError('household_not_found', 404);
  if (admin && membership.role !== 'admin') throw new AccountError('household_admin_required', 403);
  return membership;
}
export async function accountView(db: QueryDatabase, actor: Actor) {
  const rows = await db.select({ id: households.id, name: households.name, timezone: households.timezone, role: memberships.role })
    .from(memberships).innerJoin(households, eq(households.id, memberships.householdId))
    .where(eq(memberships.userId, actor.user.id));
  return {
    id: actor.user.id, avatar: actor.user.avatar ? '/api/v1/avatars/' + actor.user.avatar : null, name: actor.user.name, email: actor.user.email,
    emailVerified: !!actor.user.emailVerifiedAt, deploymentAdmin: actor.user.deploymentAdmin,
    language: actor.user.language as 'en' | 'sv', theme: actor.user.theme as 'system' | 'light' | 'dark', households: rows,
  };
}
// Serialize sensitive account mutations across API/CLI processes. This protects the
// one-time bootstrap, final-admin checks and token redemption from interleaving writes.
export const lockAccounts = (db: QueryDatabase) => db.execute(sql`select pg_advisory_xact_lock(1952804452, 2)`);
