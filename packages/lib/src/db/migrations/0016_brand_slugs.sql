ALTER TABLE "brands" ADD COLUMN "slug" text;--> statement-breakpoint
CREATE UNIQUE INDEX "brands_organization_id_slug_idx" ON "brands" USING btree ("organization_id","slug");