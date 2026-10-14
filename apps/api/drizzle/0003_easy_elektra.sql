CREATE TYPE "public"."planning_bucket" AS ENUM('someday', 'within_year', 'within_month', 'ready');--> statement-breakpoint
CREATE TYPE "public"."entity_kind" AS ENUM('epic', 'place', 'resource', 'tag');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'done');--> statement-breakpoint
CREATE TABLE "planning_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"kind" "entity_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT 'house' NOT NULL,
	"color" text DEFAULT 'blue' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"radius" double precision,
	"version" integer DEFAULT 1 NOT NULL,
	"sort_order" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planning_settings" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"size_thresholds" jsonb DEFAULT '[60,240,480,1440]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"actor_id" uuid,
	"version" integer NOT NULL,
	"fields" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_assignees" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "task_assignees_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "task_entities" (
	"task_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	CONSTRAINT "task_entities_task_id_entity_id_pk" PRIMARY KEY("task_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"planning_bucket" "planning_bucket" DEFAULT 'someday' NOT NULL,
	"preceding_column" text,
	"epic_id" uuid,
	"high" boolean DEFAULT false NOT NULL,
	"size" text,
	"estimate_minutes" integer,
	"start_date" text,
	"start_time" text,
	"deadline_date" text,
	"deadline_time" text,
	"version" integer DEFAULT 1 NOT NULL,
	"field_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"archived_at" timestamp with time zone,
	"trashed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "planning_entities" ADD CONSTRAINT "planning_entities_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_settings" ADD CONSTRAINT "planning_settings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_entities" ADD CONSTRAINT "task_entities_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_entities" ADD CONSTRAINT "task_entities_entity_id_planning_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."planning_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_epic_id_planning_entities_id_fk" FOREIGN KEY ("epic_id") REFERENCES "public"."planning_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entity_household_idx" ON "planning_entities" USING btree ("household_id","kind","sort_order");--> statement-breakpoint
CREATE INDEX "task_household_order_idx" ON "tasks" USING btree ("household_id","sort_order");--> statement-breakpoint
CREATE INDEX "task_epic_idx" ON "tasks" USING btree ("epic_id");