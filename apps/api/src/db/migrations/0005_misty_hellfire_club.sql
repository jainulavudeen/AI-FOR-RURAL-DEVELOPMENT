CREATE TABLE "site_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" uuid NOT NULL,
	"report_id" uuid,
	"digipin" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"photo_data_url" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appeals" DROP CONSTRAINT "appeals_status_check";--> statement-breakpoint
ALTER TABLE "appeals" ADD COLUMN "escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "appeals" ADD COLUMN "escalation_reason" text;--> statement-breakpoint
ALTER TABLE "appeals" ADD COLUMN "cpgrams_reference_id" text;--> statement-breakpoint
ALTER TABLE "site_captures" ADD CONSTRAINT "site_captures_applicant_id_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_captures" ADD CONSTRAINT "site_captures_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_escalation_reason_check" CHECK ("appeals"."escalation_reason" is null or "appeals"."escalation_reason" in ('sla_breach', 'applicant_requested'));--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_status_check" CHECK ("appeals"."status" in ('pending', 'assigned', 'in_review', 'resolved', 'rejected', 'escalated'));