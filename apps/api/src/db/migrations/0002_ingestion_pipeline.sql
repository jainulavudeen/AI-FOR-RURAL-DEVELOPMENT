CREATE TABLE "dataset_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"vintage_label" text NOT NULL,
	"source_description" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"record_count" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gp_infrastructure_indicators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"village_id" uuid NOT NULL,
	"sector" text NOT NULL,
	"indicator_name" text NOT NULL,
	"indicator_value" text NOT NULL,
	"numeric_value" numeric,
	"survey_year" integer NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gp_indicators_village_sector_indicator_year_unique" UNIQUE("village_id","sector","indicator_name","survey_year")
);
--> statement-breakpoint
CREATE TABLE "shg_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"social_category" text NOT NULL,
	"active_shg_count" integer NOT NULL,
	"as_of_date" date NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shg_registry_block_category_date_unique" UNIQUE("block_id","social_category","as_of_date"),
	CONSTRAINT "shg_registry_social_category_check" CHECK ("shg_registry"."social_category" in ('sc', 'st', 'obc', 'minority', 'general', 'total'))
);
--> statement-breakpoint
CREATE TABLE "village_amenities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"village_id" uuid NOT NULL,
	"facility_type" text NOT NULL,
	"distance_km" numeric,
	"available_in_village" boolean DEFAULT false NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "village_amenities_village_facility_unique" UNIQUE("village_id","facility_type")
);
--> statement-breakpoint
CREATE TABLE "villages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"name" text NOT NULL,
	"lgd_code" text,
	"digipin" text,
	"geom" geometry(Point,4326),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "villages_block_name_unique" UNIQUE("block_id","name")
);
--> statement-breakpoint
ALTER TABLE "gp_infrastructure_indicators" ADD CONSTRAINT "gp_infrastructure_indicators_village_id_villages_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."villages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gp_infrastructure_indicators" ADD CONSTRAINT "gp_infrastructure_indicators_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shg_registry" ADD CONSTRAINT "shg_registry_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shg_registry" ADD CONSTRAINT "shg_registry_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "village_amenities" ADD CONSTRAINT "village_amenities_village_id_villages_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."villages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "village_amenities" ADD CONSTRAINT "village_amenities_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "villages" ADD CONSTRAINT "villages_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gp_indicators_village_id_idx" ON "gp_infrastructure_indicators" USING btree ("village_id");--> statement-breakpoint
CREATE INDEX "shg_registry_block_id_idx" ON "shg_registry" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "village_amenities_village_id_idx" ON "village_amenities" USING btree ("village_id");--> statement-breakpoint
CREATE INDEX "villages_block_id_idx" ON "villages" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "villages_digipin_idx" ON "villages" USING btree ("digipin");--> statement-breakpoint
CREATE INDEX "villages_geom_gist_idx" ON "villages" USING gist ("geom");