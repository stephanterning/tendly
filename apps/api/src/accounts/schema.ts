import { boolean, bigint, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('household_role', ['admin', 'member']);
export const tokenPurpose = pgEnum('token_purpose', ['bootstrap', 'invite', 'recovery', 'verify_email']);
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  deploymentAdmin: boolean('deployment_admin').notNull().default(false),
  language: text('language').notNull().default('en'),
  theme: text('theme').notNull().default('system'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const households = pgTable('households', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull(),
});
export const memberships = pgTable('memberships', {
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: roleEnum('role').notNull(),
}, (table) => [primaryKey({ columns: [table.householdId, table.userId] }), index('membership_user_idx').on(table.userId)]);
export const credentials = pgTable('passkey_credentials', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  publicKey: text('public_key').notNull(),
  counter: bigint('counter', { mode: 'number' }).notNull(),
  transports: jsonb('transports').$type<string[]>().notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('credential_user_idx').on(table.userId)]);
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), // SHA-256 digest; the bearer value never reaches the database.
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  authenticatedAt: timestamp('authenticated_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [index('session_user_idx').on(table.userId)]);
export const tokens = pgTable('account_tokens', {
  id: text('id').primaryKey(),
  purpose: tokenPurpose('purpose').notNull(),
  verifiesEmail: boolean('verifies_email').notNull().default(false),
  email: text('email'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  householdId: uuid('household_id').references(() => households.id, { onDelete: 'cascade' }),
  role: roleEnum('role'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export type CeremonyContext = {
  flow: 'bootstrap' | 'invite' | 'recovery' | 'add' | 'login';
  userId?: string;
  tokenHash?: string;
  sessionHash?: string;
  email?: string;
  name?: string;
  language?: 'en' | 'sv';
  householdName?: string;
  timezone?: string;
};
export const challenges = pgTable('auth_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  challenge: text('challenge').notNull(),
  bindingHash: text('binding_hash').notNull(),
  context: jsonb('context').$type<CeremonyContext>().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
export const smtpSettings = pgTable('smtp_settings', {
  id: integer('id').primaryKey(),
  encrypted: text('encrypted').notNull(),
});
export const securityEvents = pgTable('security_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  subjectId: uuid('subject_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
