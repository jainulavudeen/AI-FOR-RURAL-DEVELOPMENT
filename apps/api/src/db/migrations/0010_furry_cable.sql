CREATE TABLE "bank_dossier_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dossier_id" uuid NOT NULL,
	"officer_id" uuid NOT NULL,
	"officer_name" text NOT NULL,
	"officer_designation" text NOT NULL,
	"signature_hash" text NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_dossier_approvals_signature_hash_unique" UNIQUE("signature_hash")
);
--> statement-breakpoint
ALTER TABLE "bank_dossier_approvals" ADD CONSTRAINT "bank_dossier_approvals_dossier_id_bank_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."bank_dossiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_dossier_approvals" ADD CONSTRAINT "bank_dossier_approvals_officer_id_applicants_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_dossier_approvals_dossier_id_idx" ON "bank_dossier_approvals" USING btree ("dossier_id");--> statement-breakpoint
CREATE INDEX "bank_dossier_approvals_signature_hash_idx" ON "bank_dossier_approvals" USING btree ("signature_hash");