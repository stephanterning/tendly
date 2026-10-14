import { pgTable, pgEnum, uuid, text, integer, boolean, timestamp, doublePrecision, jsonb, primaryKey, index, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { households, users } from '../accounts/schema.js';
export const kindEnum = pgEnum('entity_kind', ['epic', 'place', 'resource', 'tag']);
export const statusEnum = pgEnum('task_status', ['todo', 'in_progress', 'done']);
export const bucketEnum = pgEnum('planning_bucket', ['someday', 'within_year', 'within_month', 'ready']);
export const entities = pgTable('planning_entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  kind: kindEnum('kind').notNull(), name: text('name').notNull(),
  description: text('description').notNull().default(''), icon: text('icon').notNull().default('house'),
  color: text('color').notNull().default('blue'), archived: boolean('archived').notNull().default(false),
  latitude: doublePrecision('latitude'), longitude: doublePrecision('longitude'), radius: doublePrecision('radius'),
  version: integer('version').notNull().default(1), order: doublePrecision('sort_order').notNull(),
}, t => [index('entity_household_idx').on(t.householdId, t.kind, t.order)]);
export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').references((): AnyPgColumn => tasks.id, { onDelete: 'restrict' }),
  inherit: jsonb('inherit').$type<('epicId' | 'high' | 'startDate' | 'deadlineDate' | 'assignees')[]>().notNull().default([]),
  title: text('title').notNull(), description: text('description').notNull().default(''),
  status: statusEnum('status').notNull().default('todo'), bucket: bucketEnum('planning_bucket').notNull().default('someday'),
  precedingColumn: text('preceding_column'),
  epicId: uuid('epic_id').references(() => entities.id, { onDelete: 'set null' }),
  high: boolean('high').notNull().default(false), size: text('size'), estimateMinutes: integer('estimate_minutes'),
  startDate: text('start_date'), startTime: text('start_time'), deadlineDate: text('deadline_date'), deadlineTime: text('deadline_time'),
  version: integer('version').notNull().default(1),
  // Revision metadata distinguishes safe different-field changes from stale overwrites.
  fieldVersions: jsonb('field_versions').$type<Record<string, number>>().notNull().default({}),
  order: doublePrecision('sort_order').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  completedAt: timestamp('completed_at', { withTimezone: true }), completedBy: uuid('completed_by').references(() => users.id, { onDelete: 'set null' }),
  archivedAt: timestamp('archived_at', { withTimezone: true }), trashedAt: timestamp('trashed_at', { withTimezone: true }),
}, t => [index('task_household_order_idx').on(t.householdId, t.order), index('task_epic_idx').on(t.epicId), index('task_parent_idx').on(t.parentId)]);
export const taskEntities = pgTable('task_entities', {
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  entityId: uuid('entity_id').notNull().references(() => entities.id, { onDelete: 'cascade' }),
}, t => [primaryKey({ columns: [t.taskId, t.entityId] })]);
export const taskAssignees = pgTable('task_assignees', {
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, t => [primaryKey({ columns: [t.taskId, t.userId] })]);
export const taskActivities = pgTable('task_activities', {
  id: uuid('id').primaryKey().defaultRandom(), taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  version: integer('version').notNull(), fields: jsonb('fields').$type<string[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const planningSettings = pgTable('planning_settings', {
  householdId: uuid('household_id').primaryKey().references(() => households.id, { onDelete: 'cascade' }),
  thresholds: jsonb('size_thresholds').$type<[number, number, number, number]>().notNull().default([60, 240, 480, 1440]),
  version: integer('version').notNull().default(1),
});

export const taskEntityExclusions = pgTable('task_entity_exclusions', {
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  entityId: uuid('entity_id').notNull().references(() => entities.id, { onDelete: 'cascade' }),
}, t => [primaryKey({ columns: [t.taskId, t.entityId] })]);
export const taskDependencies = pgTable('task_dependencies', {
  blockedTaskId: uuid('blocked_task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  // Retain the identity after permanent deletion; a missing blocker is unresolved.
  blockingTaskId: uuid('blocking_task_id').notNull(),
}, t => [primaryKey({ columns: [t.blockedTaskId, t.blockingTaskId] }), index('dependency_blocker_idx').on(t.blockingTaskId)]);
export const taskRelations = pgTable('task_relations', {
  firstId: uuid('first_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  secondId: uuid('second_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
}, t => [primaryKey({ columns: [t.firstId, t.secondId] }), index('relation_second_idx').on(t.secondId)]);
