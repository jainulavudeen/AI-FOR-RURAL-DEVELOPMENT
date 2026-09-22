CREATE TABLE "bank_statement_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"status" text NOT NULL,
	"transactions_extracted" integer DEFAULT 0 NOT NULL,
	"warnings" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_statement_uploads_status_check" CHECK ("bank_statement_uploads"."status" in ('success', 'partial', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD COLUMN "source" text DEFAULT 'self_reported' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_statement_uploads" ADD CONSTRAINT "bank_statement_uploads_applicant_id_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_statement_uploads_applicant_id_idx" ON "bank_statement_uploads" USING btree ("applicant_id");--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_source_check" CHECK ("ledger_transactions"."source" in ('self_reported', 'bank_statement'));