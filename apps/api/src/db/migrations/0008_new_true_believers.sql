CREATE TABLE "business_types" (
	"id" text PRIMARY KEY NOT NULL,
	"icon" text NOT NULL,
	"name_key" text NOT NULL,
	"desc_key" text NOT NULL,
	"base_score" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
