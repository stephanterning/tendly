import { pgTable, uuid, text, integer, jsonb, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import type { Recurrence, TemplateNode } from '@tendly/shared';
import { households } from '../accounts/schema.js';
export const templates = pgTable('task_templates', {
  id: uuid('id').primaryKey().defaultRandom(), householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }), name: text('name').notNull(), version: integer('version').notNull().default(1), nodes: jsonb('nodes').$type<TemplateNode[]>().notNull(), recurrence: jsonb('recurrence').$type<Recurrence | null>(),
});
export const occurrences = pgTable('task_occurrences', { templateId: uuid('template_id').notNull().references(() => templates.id, { onDelete: 'cascade' }), date: text('date').notNull(), rootId: uuid('root_id').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow() }, t => [primaryKey({ columns: [t.templateId, t.date] })]);
export const lifecycleSettings = pgTable('lifecycle_settings', { householdId: uuid('household_id').primaryKey().references(() => households.id, { onDelete: 'cascade' }), version: integer('version').notNull().default(1), archiveDays: integer('archive_days').default(30), trashDays: integer('trash_days').notNull().default(30) });
