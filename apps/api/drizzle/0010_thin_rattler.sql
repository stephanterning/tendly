ALTER TABLE "task_files" DROP CONSTRAINT "task_files_task_id_tasks_id_fk";
--> statement-breakpoint
ALTER TABLE "task_files" ALTER COLUMN "task_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "task_files" ADD CONSTRAINT "task_files_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;