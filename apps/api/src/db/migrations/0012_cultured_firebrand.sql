ALTER TABLE "blocks" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "districts" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_code_unique" UNIQUE("code");--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_code_unique" UNIQUE("code");