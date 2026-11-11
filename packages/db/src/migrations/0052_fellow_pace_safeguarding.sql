CREATE TYPE "public"."fellow_consent_status" AS ENUM('none', 'pending', 'granted', 'revoked');--> statement-breakpoint
CREATE TABLE "organization_member_safeguarding" (
	"organization_member_id" bigint PRIMARY KEY NOT NULL,
	"is_minor" boolean DEFAULT false NOT NULL,
	"guardian_name" text,
	"guardian_email" text,
	"guardian_phone" text,
	"consent_status" "fellow_consent_status" DEFAULT 'none' NOT NULL,
	"consent_at" timestamp with time zone,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "organization_member_safeguarding_consent_date_check" CHECK ((
		("consent_status" = 'none' AND "consent_at" IS NULL)
		OR ("consent_status" <> 'none' AND "consent_at" IS NOT NULL)
	))
);
--> statement-breakpoint
CREATE TABLE "organization_member_safeguarding_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"member_id" bigint NOT NULL,
	"profile_id" uuid,
	"target_email" text,
	"actor_profile_id" uuid,
	"actor_email" text,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentor_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"mentor_profile_id" uuid NOT NULL,
	"fellow_profile_id" uuid NOT NULL,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	CONSTRAINT "mentor_assignment_org_mentor_fellow_unique" UNIQUE("organization_id","mentor_profile_id","fellow_profile_id"),
	CONSTRAINT "mentor_assignment_distinct_profiles" CHECK ("mentor_profile_id" <> "fellow_profile_id")
);
--> statement-breakpoint
ALTER TABLE "organization_member_safeguarding" ADD CONSTRAINT "organization_member_safeguarding_organization_member_id_fkey" FOREIGN KEY ("organization_member_id") REFERENCES "public"."organizationmember"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_member_safeguarding" ADD CONSTRAINT "organization_member_safeguarding_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_member_safeguarding_audit" ADD CONSTRAINT "organization_member_safeguarding_audit_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_assignment" ADD CONSTRAINT "mentor_assignment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_assignment" ADD CONSTRAINT "mentor_assignment_mentor_profile_id_fkey" FOREIGN KEY ("mentor_profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_assignment" ADD CONSTRAINT "mentor_assignment_fellow_profile_id_fkey" FOREIGN KEY ("fellow_profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_assignment" ADD CONSTRAINT "mentor_assignment_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_safeguarding_audit_org_member_created" ON "organization_member_safeguarding_audit" USING btree ("organization_id","member_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_mentor_assignment_org_mentor" ON "mentor_assignment" USING btree ("organization_id","mentor_profile_id");--> statement-breakpoint
CREATE INDEX "idx_mentor_assignment_org_fellow" ON "mentor_assignment" USING btree ("organization_id","fellow_profile_id");
