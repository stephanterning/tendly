import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
// Only installation metadata belongs in Stage 1; account/domain tables follow in their stages.
export const installation = pgTable('installation', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export * from '../accounts/schema.js';
export * from '../tasks/schema.js';
export * from '../planning/schema.js';
export * from '../lifecycle/schema.js';
export * from '../content/schema.js';
