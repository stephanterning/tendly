CREATE TABLE "filter_versions" (
	"filter_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "filter_versions_filter_id_version_pk" PRIMARY KEY("filter_id","version")
);
--> statement-breakpoint
CREATE TABLE "saved_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"creator_id" uuid,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	"builtin" text,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"expression" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_order_versions" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_view_contexts" (
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"current_place_id" uuid,
	CONSTRAINT "user_view_contexts_household_id_user_id_pk" PRIMARY KEY("household_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "user_view_states" (
	"view_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"active_filters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "user_view_states_view_id_user_id_pk" PRIMARY KEY("view_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"creator_id" uuid,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	"builtin" text,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"presentation" text NOT NULL,
	"expression" jsonb NOT NULL,
	"quick_filters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort" text DEFAULT 'manual' NOT NULL,
	"epic_lanes" boolean DEFAULT false NOT NULL,
	"show_empty_lanes" boolean DEFAULT false NOT NULL,
	"card_properties" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "filter_versions" ADD CONSTRAINT "filter_versions_filter_id_saved_filters_id_fk" FOREIGN KEY ("filter_id") REFERENCES "public"."saved_filters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filter_versions" ADD CONSTRAINT "filter_versions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_order_versions" ADD CONSTRAINT "task_order_versions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_view_contexts" ADD CONSTRAINT "user_view_contexts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_view_contexts" ADD CONSTRAINT "user_view_contexts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_view_contexts" ADD CONSTRAINT "user_view_contexts_current_place_id_planning_entities_id_fk" FOREIGN KEY ("current_place_id") REFERENCES "public"."planning_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_view_states" ADD CONSTRAINT "user_view_states_view_id_saved_views_id_fk" FOREIGN KEY ("view_id") REFERENCES "public"."saved_views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_view_states" ADD CONSTRAINT "user_view_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "filter_builtin_idx" ON "saved_filters" USING btree ("household_id","builtin");--> statement-breakpoint
CREATE UNIQUE INDEX "view_builtin_idx" ON "saved_views" USING btree ("household_id","builtin");