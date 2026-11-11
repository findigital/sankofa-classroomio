CREATE TABLE "messaging_cohort_setting" (
	"group_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"fellow_dm_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "messaging_keyword" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"phrase" text NOT NULL,
	"action" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	CONSTRAINT "messaging_keyword_action_check" CHECK ("action" in ('flag', 'block'))
);
--> statement-breakpoint
CREATE TABLE "messaging_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_profile_id" uuid,
	"action" text NOT NULL,
	"channel_type" text,
	"channel_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	CONSTRAINT "messaging_audit_action_check" CHECK ("action" in ('read', 'export', 'disclosure', 'keyword_upsert', 'keyword_delete'))
);
--> statement-breakpoint
CREATE TABLE "messaging_disclosure" (
	"organization_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	CONSTRAINT "messaging_disclosure_pkey" PRIMARY KEY("organization_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "messaging_mute" (
	"organization_id" uuid NOT NULL,
	"muter_profile_id" uuid NOT NULL,
	"muted_profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	CONSTRAINT "messaging_mute_pkey" PRIMARY KEY("organization_id","muter_profile_id","muted_profile_id"),
	CONSTRAINT "messaging_mute_distinct_profiles" CHECK ("muter_profile_id" <> "muted_profile_id")
);
--> statement-breakpoint
CREATE TABLE "messaging_flag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"channel_type" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"reporter_profile_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messaging_cohort_setting" ADD CONSTRAINT "messaging_cohort_setting_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_cohort_setting" ADD CONSTRAINT "messaging_cohort_setting_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_cohort_setting" ADD CONSTRAINT "messaging_cohort_setting_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_keyword" ADD CONSTRAINT "messaging_keyword_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_keyword" ADD CONSTRAINT "messaging_keyword_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_audit" ADD CONSTRAINT "messaging_audit_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_audit" ADD CONSTRAINT "messaging_audit_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_disclosure" ADD CONSTRAINT "messaging_disclosure_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_disclosure" ADD CONSTRAINT "messaging_disclosure_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_mute" ADD CONSTRAINT "messaging_mute_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_mute" ADD CONSTRAINT "messaging_mute_muter_profile_id_fkey" FOREIGN KEY ("muter_profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_mute" ADD CONSTRAINT "messaging_mute_muted_profile_id_fkey" FOREIGN KEY ("muted_profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_flag" ADD CONSTRAINT "messaging_flag_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_flag" ADD CONSTRAINT "messaging_flag_reporter_profile_id_fkey" FOREIGN KEY ("reporter_profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_keyword_org_phrase_idx" ON "messaging_keyword" USING btree ("organization_id",lower("phrase"));--> statement-breakpoint
CREATE INDEX "idx_messaging_audit_org_created" ON "messaging_audit" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_messaging_flag_org_channel" ON "messaging_flag" USING btree ("organization_id","channel_type","channel_id");
