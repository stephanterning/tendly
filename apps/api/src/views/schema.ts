import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { households, users } from '../accounts/schema.js';
import { entities } from '../tasks/schema.js';
import type { FilterExpression, ViewFields } from '@tendly/shared';
const identity = () => ({
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  creatorId: uuid('creator_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  icon: text('icon').notNull(),
  color: text('color').notNull(),
  builtin: text('builtin'),
  version: integer('version').notNull().default(1),
  deleted: boolean('deleted').notNull().default(false),
});
export const filters = pgTable(
  'saved_filters',
  { ...identity(), expression: jsonb('expression').$type<FilterExpression>().notNull() },
  (t) => [uniqueIndex('filter_builtin_idx').on(t.householdId, t.builtin)],
);
export const filterVersions = pgTable(
  'filter_versions',
  {
    filterId: uuid('filter_id')
      .notNull()
      .references(() => filters.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    snapshot: jsonb('snapshot')
      .$type<{ name: string; icon: string; color: string; expression: FilterExpression }>()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.filterId, t.version] })],
);
export const views = pgTable(
  'saved_views',
  {
    ...identity(),
    presentation: text('presentation').notNull(),
    expression: jsonb('expression').$type<FilterExpression>().notNull(),
    quickFilters: jsonb('quick_filters').$type<string[]>().notNull().default([]),
    sort: text('sort').notNull().default('manual'),
    epicLanes: boolean('epic_lanes').notNull().default(false),
    showEmptyLanes: boolean('show_empty_lanes').notNull().default(false),
    cardProperties: jsonb('card_properties').$type<ViewFields['cardProperties']>().notNull(),
  },
  (t) => [uniqueIndex('view_builtin_idx').on(t.householdId, t.builtin)],
);
export const viewStates = pgTable(
  'user_view_states',
  {
    viewId: uuid('view_id')
      .notNull()
      .references(() => views.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    favorite: boolean('favorite').notNull().default(false),
    activeFilters: jsonb('active_filters').$type<string[]>().notNull().default([]),
  },
  (t) => [primaryKey({ columns: [t.viewId, t.userId] })],
);
export const viewContexts = pgTable(
  'user_view_contexts',
  {
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    currentPlaceId: uuid('current_place_id').references(() => entities.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] })],
);
export const taskOrderVersions = pgTable('task_order_versions', {
  householdId: uuid('household_id')
    .primaryKey()
    .references(() => households.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(0),
});
