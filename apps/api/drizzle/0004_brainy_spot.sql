CREATE TABLE "task_dependencies" (
	"blocked_task_id" uuid NOT NULL,
	"blocking_task_id" uuid NOT NULL,
	CONSTRAINT "task_dependencies_blocked_task_id_blocking_task_id_pk" PRIMARY KEY("blocked_task_id","blocking_task_id")
);
--> statement-breakpoint
CREATE TABLE "task_entity_exclusions" (
	"task_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	CONSTRAINT "task_entity_exclusions_task_id_entity_id_pk" PRIMARY KEY("task_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "task_relations" (
	"first_id" uuid NOT NULL,
	"second_id" uuid NOT NULL,
	CONSTRAINT "task_relations_first_id_second_id_pk" PRIMARY KEY("first_id","second_id")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "inherit" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_blocked_task_id_tasks_id_fk" FOREIGN KEY ("blocked_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_entity_exclusions" ADD CONSTRAINT "task_entity_exclusions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_entity_exclusions" ADD CONSTRAINT "task_entity_exclusions_entity_id_planning_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."planning_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_relations" ADD CONSTRAINT "task_relations_first_id_tasks_id_fk" FOREIGN KEY ("first_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_relations" ADD CONSTRAINT "task_relations_second_id_tasks_id_fk" FOREIGN KEY ("second_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dependency_blocker_idx" ON "task_dependencies" USING btree ("blocking_task_id");--> statement-breakpoint
CREATE INDEX "relation_second_idx" ON "task_relations" USING btree ("second_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_parent_idx" ON "tasks" USING btree ("parent_id");