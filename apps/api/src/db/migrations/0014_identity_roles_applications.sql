CREATE TABLE "application_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"dossier_id" uuid,
	"officer_id" uuid NOT NULL,
	"officer_name" text NOT NULL,
	"officer_designation" text NOT NULL,
	"decision" text NOT NULL,
	"note" text,
	"signature_hash" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_decisions_signature_hash_unique" UNIQUE("signature_hash"),
	CONSTRAINT "application_decisions_decision_check" CHECK ("application_decisions"."decision" in ('approved', 'rejected', 'more_info')),
	CONSTRAINT "application_decisions_hash_check" CHECK (("application_decisions"."decision" = 'approved') = ("application_decisions"."signature_hash" is not null))
);
--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_role" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"note" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"dossier_id" uuid,
	"district_id" uuid,
	"block_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"assigned_officer_id" uuid,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_status_check" CHECK ("applications"."status" in ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'more_info'))
);
--> statement-breakpoint
CREATE TABLE "officer_jurisdictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"officer_id" uuid NOT NULL,
	"district_id" uuid NOT NULL,
	"block_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "officer_jurisdictions_unique" UNIQUE NULLS NOT DISTINCT("officer_id","district_id","block_id")
);
--> statement-breakpoint
ALTER TABLE "applicants" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "applicants" ADD COLUMN "google_sub" text;--> statement-breakpoint
ALTER TABLE "applicants" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "applicants" ADD COLUMN "invited_email" text;--> statement-breakpoint
ALTER TABLE "applicants" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "applicants" ADD COLUMN "designation" text;--> statement-breakpoint
ALTER TABLE "applicants" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "application_decisions" ADD CONSTRAINT "application_decisions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_decisions" ADD CONSTRAINT "application_decisions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_decisions" ADD CONSTRAINT "application_decisions_dossier_id_bank_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."bank_dossiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_decisions" ADD CONSTRAINT "application_decisions_officer_id_applicants_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_actor_id_applicants_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_applicant_id_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_dossier_id_bank_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."bank_dossiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_assigned_officer_id_applicants_id_fk" FOREIGN KEY ("assigned_officer_id") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "officer_jurisdictions" ADD CONSTRAINT "officer_jurisdictions_officer_id_applicants_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "officer_jurisdictions" ADD CONSTRAINT "officer_jurisdictions_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "officer_jurisdictions" ADD CONSTRAINT "officer_jurisdictions_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "officer_jurisdictions" ADD CONSTRAINT "officer_jurisdictions_created_by_applicants_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_decisions_application_idx" ON "application_decisions" USING btree ("application_id","decided_at");--> statement-breakpoint
CREATE INDEX "application_events_application_idx" ON "application_events" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "applications_applicant_idx" ON "applications" USING btree ("applicant_id");--> statement-breakpoint
CREATE INDEX "applications_officer_idx" ON "applications" USING btree ("assigned_officer_id");--> statement-breakpoint
CREATE INDEX "applications_status_idx" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "officer_jurisdictions_officer_idx" ON "officer_jurisdictions" USING btree ("officer_id");--> statement-breakpoint
CREATE INDEX "officer_jurisdictions_district_idx" ON "officer_jurisdictions" USING btree ("district_id");--> statement-breakpoint
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_google_sub_unique" UNIQUE("google_sub");--> statement-breakpoint
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_invited_email_unique" UNIQUE("invited_email");--> statement-breakpoint
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_identity_check" CHECK ("applicants"."phone" is not null or "applicants"."google_sub" is not null or "applicants"."invited_email" is not null);