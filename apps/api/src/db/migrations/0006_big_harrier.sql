CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount" numeric NOT NULL,
	"payment_mode" text DEFAULT 'cash' NOT NULL,
	"customer_name" text,
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_transactions_type_check" CHECK ("ledger_transactions"."type" in ('sale', 'expense', 'udhaar_given', 'udhaar_repaid')),
	CONSTRAINT "ledger_transactions_payment_mode_check" CHECK ("ledger_transactions"."payment_mode" in ('cash', 'upi')),
	CONSTRAINT "ledger_transactions_amount_positive_check" CHECK ("ledger_transactions"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_applicant_id_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_transactions_applicant_id_idx" ON "ledger_transactions" USING btree ("applicant_id");