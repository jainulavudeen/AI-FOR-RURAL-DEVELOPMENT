CREATE TABLE "scheme_document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"section" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(512) NOT NULL,
	CONSTRAINT "scheme_document_chunks_document_chunk_unique" UNIQUE("document_id","chunk_index")
);
--> statement-breakpoint
CREATE TABLE "scheme_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheme_id" text NOT NULL,
	"title" text NOT NULL,
	"source_url" text NOT NULL,
	"source_description" text NOT NULL,
	"vintage_label" text NOT NULL,
	"content_hash" text NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheme_documents_scheme_id_unique" UNIQUE("scheme_id")
);
--> statement-breakpoint
ALTER TABLE "scheme_document_chunks" ADD CONSTRAINT "scheme_document_chunks_document_id_scheme_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."scheme_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheme_documents" ADD CONSTRAINT "scheme_documents_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheme_document_chunks_document_id_idx" ON "scheme_document_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "scheme_document_chunks_embedding_hnsw_idx" ON "scheme_document_chunks" USING hnsw ("embedding" vector_cosine_ops);