CREATE TABLE "filter_history" (
	"filter_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "filter_history_filter_id_version_pk" PRIMARY KEY("filter_id","version")
);
--> statement-breakpoint
CREATE TABLE "saved_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT 'list-filter' NOT NULL,
	"color" text DEFAULT 'blue' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"builtin" text,
	"definition" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "view_personal" (
	"view_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active_filters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"favorite" integer DEFAULT 0 NOT NULL,
	"current_place" uuid,
	CONSTRAINT "view_personal_view_id_user_id_pk" PRIMARY KEY("view_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT 'list-filter' NOT NULL,
	"color" text DEFAULT 'blue' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"builtin" text,
	"definition" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "filter_history" ADD CONSTRAINT "filter_history_filter_id_saved_filters_id_fk" FOREIGN KEY ("filter_id") REFERENCES "public"."saved_filters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filter_history" ADD CONSTRAINT "filter_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_personal" ADD CONSTRAINT "view_personal_view_id_saved_views_id_fk" FOREIGN KEY ("view_id") REFERENCES "public"."saved_views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_personal" ADD CONSTRAINT "view_personal_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "view_household_builtin_idx" ON "saved_views" USING btree ("household_id","builtin");