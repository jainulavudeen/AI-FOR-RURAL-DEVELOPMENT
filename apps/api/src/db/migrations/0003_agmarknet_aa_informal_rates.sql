CREATE TABLE "aa_fetch_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" uuid NOT NULL,
	"consent_id" text NOT NULL,
	"purpose" text NOT NULL,
	"status" text NOT NULL,
	"record_count" integer,
	"requested_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aa_fetch_log_status_check" CHECK ("aa_fetch_log"."status" in ('success', 'failure'))
);
--> statement-breakpoint
CREATE TABLE "informal_lending_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"district_id" uuid,
	"rate_percent" numeric NOT NULL,
	"vintage_label" text NOT NULL,
	"source_description" text NOT NULL,
	"is_estimate" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applicants" ADD COLUMN "aa_consent_id" text;--> statement-breakpoint
ALTER TABLE "applicants" ADD COLUMN "aa_consent_status" text;--> statement-breakpoint
ALTER TABLE "applicants" ADD COLUMN "aa_consent_scope" jsonb;--> statement-breakpoint
ALTER TABLE "applicants" ADD COLUMN "aa_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "aa_fetch_log" ADD CONSTRAINT "aa_fetch_log_applicant_id_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "informal_lending_rates" ADD CONSTRAINT "informal_lending_rates_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aa_fetch_log_applicant_id_idx" ON "aa_fetch_log" USING btree ("applicant_id");--> statement-breakpoint
CREATE INDEX "informal_lending_rates_district_id_idx" ON "informal_lending_rates" USING btree ("district_id");--> statement-breakpoint
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_aa_consent_status_check" CHECK ("applicants"."aa_consent_status" is null or "applicants"."aa_consent_status" in ('not_requested', 'pending', 'active', 'rejected', 'revoked', 'expired'));