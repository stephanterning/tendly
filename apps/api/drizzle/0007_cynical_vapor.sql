CREATE TABLE "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"comment_id" uuid,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_files" ADD CONSTRAINT "task_files_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_files" ADD CONSTRAINT "task_files_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_files" ADD CONSTRAINT "task_files_comment_id_task_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."task_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_task_idx" ON "task_comments" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "file_task_idx" ON "task_files" USING btree ("task_id");