CREATE TABLE "lifecycle_settings" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archive_days" integer DEFAULT 30,
	"trash_days" integer DEFAULT 30 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_occurrences" (
	"template_id" uuid NOT NULL,
	"date" text NOT NULL,
	"root_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_occurrences_template_id_date_pk" PRIMARY KEY("template_id","date")
);
--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"nodes" jsonb NOT NULL,
	"recurrence" jsonb
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "trash_root_id" uuid;--> statement-breakpoint
ALTER TABLE "lifecycle_settings" ADD CONSTRAINT "lifecycle_settings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_template_id_task_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."task_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;