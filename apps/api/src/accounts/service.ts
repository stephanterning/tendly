import { tasks, taskAssignees, taskActivities } from '../tasks/schema.js';
import { templates } from '../lifecycle/schema.js';
import { randomUUID } from 'node:crypto';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import {
  generateRegistrationOptions, generateAuthenticationOptions,
  verifyRegistrationResponse, verifyAuthenticationResponse,
  type RegistrationResponseJSON, type AuthenticationResponseJSON, type AuthenticatorTransport,
} from '@simplewebauthn/server';
import type { RegistrationInput } from '@tendly/shared';
import type { Database, QueryDatabase } from './database.js';
import { challenges, credentials, households, memberships, securityEvents, sessions, tokens, users, type CeremonyContext } from './schema.js';
import { digest, randomToken } from './crypto.js';
import { AccountError } from './errors.js';
import { findSession, householdAccess, lockAccounts, recent, type Actor } from './access.js';

const expires = (minutes: number) => new Date(Date.now() + minutes * 60_000);
export class AccountService {
  readonly rpId: string;
  constructor(readonly db: Database, readonly origin: string) { this.rpId = new URL(origin).hostname; }
  async initialized(db: QueryDatabase = this.db) {
    return (await db.select({ id: users.id }).from(users).limit(1)).length > 0;
  }
  async createBootstrap() {
    return this.db.transaction(async (tx) => {
      await lockAccounts(tx);
      if (await this.initialized(tx)) throw new AccountError('setup_already_complete', 409);
      await tx.delete(tokens).where(eq(tokens.purpose, 'bootstrap'));
      const token = randomToken();
      await tx.insert(tokens).values({ id: digest(token), purpose: 'bootstrap', expiresAt: expires(30) });
      return token;
    });
  }
  async createRecovery(email: string, actorId?: string, allowUnverified = false) {
    return this.db.transaction(async (tx) => {
      await lockAccounts(tx);
      const [user] = await tx.select().from(users).where(eq(users.email, email));
      if (!user || (!allowUnverified && !user.emailVerifiedAt)) return null;
      const token = randomToken();
      await tx.insert(tokens).values({ id: digest(token), purpose: 'recovery', userId: user.id, email, expiresAt: expires(15) });
      await tx.insert(securityEvents).values({ actorId: actorId ?? null, subjectId: user.id, action: allowUnverified ? 'cli_recovery_issued' : 'email_recovery_issued' });
      return token;
    });
  }
  async validToken(hash: string, db: QueryDatabase = this.db) {
    const [token] = await db.select().from(tokens).where(and(eq(tokens.id, hash), isNull(tokens.usedAt), gt(tokens.expiresAt, new Date())));
    if (!token) throw new AccountError('invalid_or_expired_link');
    return token;
  }
  async registrationOptions(input: RegistrationInput, actor: Actor | null, binding: string) {
    let context: CeremonyContext;
    let email: string;
    if (input.flow === 'add') {
      recent(actor);
      email = actor.user.email;
      context = { flow: 'add', userId: actor.user.id, sessionHash: actor.session.id };
    } else {
      const token = await this.validToken(digest(input.token));
      const purpose = input.flow === 'bootstrap' ? 'bootstrap' : input.flow === 'invite' ? 'invite' : 'recovery';
      if (token.purpose !== purpose) throw new AccountError('invalid_or_expired_link');
      if (input.flow === 'bootstrap') {
        if (await this.initialized()) throw new AccountError('setup_already_complete', 409);
        email = input.email;
        context = { flow: input.flow, tokenHash: token.id, userId: randomUUID(), email, language: input.language ?? 'en', name: input.name, householdName: input.householdName, timezone: input.timezone };
      } else if (input.flow === 'invite') {
        if (!token.email) throw new AccountError('invalid_or_expired_link');
        email = token.email;
        const [existing] = await this.db.select().from(users).where(eq(users.email, email));
        // An invitation grants membership, not permission to replace an
        // existing account's passkeys. Existing users accept while signed in.
        if (existing) throw new AccountError('sign_in_to_accept_invitation', 409);
        context = { flow: input.flow, tokenHash: token.id, userId: randomUUID(), email, language: input.language ?? 'en', name: input.name };
      } else {
        if (!token.userId || !token.email) throw new AccountError('invalid_or_expired_link');
        email = token.email;
        context = { flow: input.flow, tokenHash: token.id, userId: token.userId, email };
      }
    }
    const existing = await this.db.select().from(credentials).where(eq(credentials.userId, context.userId!));
    const options = await generateRegistrationOptions({
      rpName: 'Tendly', rpID: this.rpId, userID: new TextEncoder().encode(context.userId), userName: email,
      attestationType: 'none', authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      excludeCredentials: existing.map((key) => ({ id: key.id })),
    });
    const [ceremony] = await this.db.insert(challenges).values({ challenge: options.challenge, bindingHash: digest(binding), context, expiresAt: expires(5) }).returning({ id: challenges.id });
    return { ceremonyId: ceremony!.id, options: { ...options } };
  }
  async takeChallenge(id: string, binding: string) {
    // Delete before verification, so failed assertions cannot be replayed either.
    const [row] = await this.db.delete(challenges).where(and(eq(challenges.id, id), eq(challenges.bindingHash, digest(binding)), gt(challenges.expiresAt, new Date()))).returning();
    if (!row) throw new AccountError('passkey_challenge_expired');
    return row;
  }
  async session(db: QueryDatabase, userId: string) {
    const bearer = randomToken();
    await db.insert(sessions).values({ id: digest(bearer), userId, expiresAt: expires(30 * 24 * 60) });
    return bearer;
  }
  async finishRegistration(id: string, binding: string, response: RegistrationResponseJSON, name: string, actor: Actor | null) {
    const challenge = await this.takeChallenge(id, binding);
    const context = challenge.context;
    if (context.flow === 'login' || !context.userId) throw new AccountError('invalid_ceremony');
    let verified;
    try {
      verified = await verifyRegistrationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin: this.origin, expectedRPID: this.rpId, requireUserVerification: true });
    } catch { throw new AccountError('passkey_verification_failed'); }
    if (!verified.verified || !verified.registrationInfo) throw new AccountError('passkey_verification_failed');
    const userId = context.userId;
    const credential = verified.registrationInfo.credential;
    return this.db.transaction(async (tx) => {
      await lockAccounts(tx);
      let token;
      if (context.flow === 'add') {
        recent(actor);
        const [live] = await tx.select().from(sessions).where(and(eq(sessions.id, context.sessionHash!), gt(sessions.expiresAt, new Date())));
        if (!live || actor.session.id !== live.id || live.userId !== userId) throw new AccountError('sign_in_required', 401);
      } else {
        token = await this.validToken(context.tokenHash!, tx);
        if (context.flow === 'bootstrap') {
          if (await this.initialized(tx) || token.purpose !== 'bootstrap') throw new AccountError('setup_already_complete', 409);
          await tx.insert(users).values({ id: userId, email: context.email!, name: context.name!, language: context.language ?? 'en', deploymentAdmin: true });
          const [household] = await tx.insert(households).values({ name: context.householdName!, timezone: context.timezone! }).returning();
          await tx.insert(memberships).values({ userId: userId, householdId: household!.id, role: 'admin' });
        } else if (context.flow === 'invite') {
          if (token.purpose !== 'invite' || !token.householdId || token.email !== context.email) throw new AccountError('invalid_or_expired_link');
          await tx.insert(users).values({ id: userId, email: context.email!, name: context.name!, language: context.language ?? 'en', emailVerifiedAt: token.verifiesEmail ? new Date() : null });
          await tx.insert(memberships).values({ userId: userId, householdId: token.householdId, role: token.role ?? 'member' });
        } else {
          if (token.purpose !== 'recovery' || token.userId !== userId) throw new AccountError('invalid_or_expired_link');
          await tx.delete(sessions).where(eq(sessions.userId, userId));
          await tx.update(tokens).set({ usedAt: new Date() }).where(and(eq(tokens.userId, userId), eq(tokens.purpose, 'recovery')));
        }
        await tx.update(tokens).set({ usedAt: new Date() }).where(eq(tokens.id, token.id));
      }
      await tx.insert(credentials).values({ id: credential.id, userId: userId, publicKey: Buffer.from(credential.publicKey).toString('base64url'), counter: credential.counter, transports: credential.transports ?? [], name });
      await tx.insert(securityEvents).values({ actorId: userId, subjectId: userId, action: `${context.flow}_passkey_enrolled` });
      return this.session(tx, userId);
    });
  }
  async loginOptions(binding: string, actor: Actor | null) {
    const options = await generateAuthenticationOptions({ rpID: this.rpId, userVerification: 'required' });
    const [ceremony] = await this.db.insert(challenges).values({ challenge: options.challenge, bindingHash: digest(binding), context: { flow: 'login', ...(actor ? { userId: actor.user.id } : {}) }, expiresAt: expires(5) }).returning();
    return { ceremonyId: ceremony!.id, options: { ...options } };
  }
  async finishLogin(id: string, binding: string, response: AuthenticationResponseJSON) {
    const challenge = await this.takeChallenge(id, binding);
    if (challenge.context.flow !== 'login') throw new AccountError('invalid_ceremony');
    return this.db.transaction(async (tx) => {
      // Serialize the authenticator counter check/update; simultaneous assertions
      // must not validate against the same stale counter.
      const [credential] = await tx.select().from(credentials).where(eq(credentials.id, response.id)).for('update');
      if (!credential || (challenge.context.userId && credential.userId !== challenge.context.userId)) throw new AccountError('passkey_verification_failed');
      if (response.response.userHandle && Buffer.from(response.response.userHandle, 'base64url').toString() !== credential.userId) throw new AccountError('passkey_verification_failed');
      let verified;
      try {
        verified = await verifyAuthenticationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin: this.origin, expectedRPID: this.rpId, requireUserVerification: true, credential: { id: credential.id, publicKey: new Uint8Array(Buffer.from(credential.publicKey, 'base64url')), counter: credential.counter, transports: credential.transports as AuthenticatorTransport[] } });
      } catch { throw new AccountError('passkey_verification_failed'); }
      if (!verified.verified) throw new AccountError('passkey_verification_failed');
      await tx.update(credentials).set({ counter: verified.authenticationInfo.newCounter }).where(eq(credentials.id, credential.id));
      await tx.insert(securityEvents).values({ actorId: credential.userId, subjectId: credential.userId, action: 'passkey_login' });
      return this.session(tx, credential.userId);
    });
  }
  async createInvitation(actor: Actor, householdId: string, email: string, role: 'admin' | 'member', delivery: 'email' | 'code') {
    recent(actor);
    return this.db.transaction(async (tx) => {
      await lockAccounts(tx);
      await householdAccess(tx, actor, householdId, true);
      const token = randomToken();
      const expiresAt = new Date(Date.now() + (delivery === 'code' ? 30 * 60_000 : 48 * 3600_000));
      await tx.insert(tokens).values({
        id: digest(token), purpose: 'invite', householdId, email, role, expiresAt,
        verifiesEmail: delivery === 'email',
      });
      await tx.insert(securityEvents).values({ actorId: actor.user.id, action: delivery === 'code' ? 'invitation_code_issued' : 'invitation_issued' });
      return { token, expiresAt };
    });
  }
  async acceptInvite(tokenValue: string, actor: Actor) {
    return this.db.transaction(async (tx) => {
      await lockAccounts(tx);
      const token = await this.validToken(digest(tokenValue), tx);
      if (token.purpose !== 'invite' || !token.householdId || token.email !== actor.user.email) throw new AccountError('invitation_account_mismatch', 403);
      // Re-accepting an invitation must not silently change an existing role.
      await tx.insert(memberships).values({ householdId: token.householdId, userId: actor.user.id, role: token.role ?? 'member' }).onConflictDoNothing();
      // A hand-delivered code never proves control of an email inbox.
      if (token.verifiesEmail) await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, actor.user.id));
      await tx.update(tokens).set({ usedAt: new Date() }).where(eq(tokens.id, token.id));
    });
  }
  async removePasskey(current: Actor, keyId: string) {
    await this.db.transaction(async (tx) => {
      await lockAccounts(tx);
      const all = await tx.select().from(credentials).where(eq(credentials.userId, current.user.id));
      if (!all.some((key) => key.id === keyId)) throw new AccountError('passkey_not_found', 404);
      if (all.length < 2) throw new AccountError('keep_one_passkey', 409);
      await tx.delete(credentials).where(and(eq(credentials.id, keyId), eq(credentials.userId, current.user.id)));
      await tx.insert(securityEvents).values({ actorId: current.user.id, subjectId: current.user.id, action: 'passkey_removed' });
    });
  }
  async changeMember(current: Actor, params: { id: string; userId: string }, role: 'admin' | 'member' | null) {
    await this.db.transaction(async (tx) => {
      await lockAccounts(tx);
      await tx.select().from(households).where(eq(households.id, params.id)).for('update');
      await householdAccess(tx, current, params.id, true);
      const members = await tx.select().from(memberships).where(eq(memberships.householdId, params.id));
      const target = members.find((member) => member.userId === params.userId);
      if (!target) throw new AccountError('member_not_found', 404);
      if (target.role === 'admin' && role !== 'admin' && members.filter((member) => member.role === 'admin').length === 1) throw new AccountError('keep_one_household_admin', 409);
      const scope = and(eq(memberships.householdId, params.id), eq(memberships.userId, params.userId));
      if (role) await tx.update(memberships).set({ role }).where(scope);
      else {
        // Removing a member also releases their assignments; revision guards stop
        // an open editor from accidentally restoring that obsolete assignment.
        const assigned = await tx.select({ task: tasks }).from(tasks).innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id)).where(and(eq(tasks.householdId, params.id), eq(taskAssignees.userId, params.userId)));
        for (const { task } of assigned) {
          await tx.delete(taskAssignees).where(and(eq(taskAssignees.taskId, task.id), eq(taskAssignees.userId, params.userId)));
          await tx.update(tasks).set({ version: task.version + 1, fieldVersions: { ...task.fieldVersions, assignees: task.version + 1 }, updatedAt: new Date() }).where(eq(tasks.id, task.id));
          await tx.insert(taskActivities).values({ taskId: task.id, actorId: current.user.id, version: task.version + 1, fields: ['assignees'] });
        }
        await tx.delete(memberships).where(scope);
        const saved = await tx.select().from(templates).where(eq(templates.householdId, params.id));
        for (const template of saved) if (template.nodes.some(node => node.value.assignees.includes(params.userId))) {
          await tx.update(templates).set({ version: template.version + 1, nodes: template.nodes.map(node => ({ ...node, value: { ...node.value, assignees: node.value.assignees.filter(id => id !== params.userId) } })) }).where(eq(templates.id, template.id));
        }
      }
      await tx.insert(securityEvents).values({ actorId: current.user.id, subjectId: target.userId, action: role ? 'household_role_changed' : 'household_member_removed' });
    });
  }
  async cleanup() {
    await this.db.delete(challenges).where(lt(challenges.expiresAt, new Date()));
    await this.db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    await this.db.delete(tokens).where(lt(tokens.expiresAt, new Date()));
  }
  findSession(bearer?: string) { return findSession(this.db, bearer); }
}
