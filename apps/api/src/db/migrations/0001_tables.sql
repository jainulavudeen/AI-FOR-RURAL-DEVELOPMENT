CREATE TABLE "appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" uuid NOT NULL,
	"report_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"assigned_officer_id" uuid,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appeals_status_check" CHECK ("appeals"."status" in ('pending', 'assigned', 'in_review', 'resolved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "applicants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"phone_verified_at" timestamp with time zone,
	"role" text DEFAULT 'applicant' NOT NULL,
	"consent_data_use" boolean DEFAULT false NOT NULL,
	"consent_marketing" boolean DEFAULT false NOT NULL,
	"consent_recorded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applicants_phone_unique" UNIQUE("phone"),
	CONSTRAINT "applicants_role_check" CHECK ("applicants"."role" in ('applicant', 'officer'))
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"district_id" uuid NOT NULL,
	"name" text NOT NULL,
	"digipin" text,
	"geom" geometry(Polygon,4326),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_district_name_unique" UNIQUE("district_id","name")
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_code" text NOT NULL,
	"state_name" text NOT NULL,
	"name" text NOT NULL,
	"digipin" text,
	"geom" geometry(MultiPolygon,4326),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "districts_state_name_unique" UNIQUE("state_code","name")
);
--> statement-breakpoint
CREATE TABLE "feedback_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" uuid NOT NULL,
	"source_table" text NOT NULL,
	"source_row_id" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_flags_status_check" CHECK ("feedback_flags"."status" in ('open', 'reviewing', 'resolved', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" uuid NOT NULL,
	"inputs" jsonb NOT NULL,
	"score" integer NOT NULL,
	"verdict_key" text NOT NULL,
	"matched_scheme_id" text NOT NULL,
	"scheme_rules_version" uuid NOT NULL,
	"emi_schedule" jsonb NOT NULL,
	"data_vintage" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheme_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheme_id" text NOT NULL,
	"version" integer NOT NULL,
	"margin_percent" numeric NOT NULL,
	"project_cost_min" numeric NOT NULL,
	"project_cost_max" numeric NOT NULL,
	"loan_cap" numeric NOT NULL,
	"interest_rate" numeric NOT NULL,
	"tenure_years" numeric NOT NULL,
	"moratorium_months" integer NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheme_rules_scheme_version_unique" UNIQUE("scheme_id","version")
);
--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_applicant_id_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_assigned_officer_id_applicants_id_fk" FOREIGN KEY ("assigned_officer_id") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_flags" ADD CONSTRAINT "feedback_flags_applicant_id_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_applicant_id_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_scheme_rules_version_scheme_rules_id_fk" FOREIGN KEY ("scheme_rules_version") REFERENCES "public"."scheme_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appeals_applicant_id_idx" ON "appeals" USING btree ("applicant_id");--> statement-breakpoint
CREATE INDEX "appeals_officer_id_idx" ON "appeals" USING btree ("assigned_officer_id");--> statement-breakpoint
CREATE INDEX "blocks_district_id_idx" ON "blocks" USING btree ("district_id");--> statement-breakpoint
CREATE INDEX "blocks_geom_gist_idx" ON "blocks" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "districts_geom_gist_idx" ON "districts" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "feedback_flags_source_idx" ON "feedback_flags" USING btree ("source_table","source_row_id");--> statement-breakpoint
CREATE INDEX "reports_applicant_id_idx" ON "reports" USING btree ("applicant_id");