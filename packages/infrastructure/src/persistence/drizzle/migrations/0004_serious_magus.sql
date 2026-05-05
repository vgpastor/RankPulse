-- BACKLOG #16 follow-up — gsc_observations gains a real natural-key PK
-- so re-running the same fetch on the same day is idempotent. Existing
-- nullable dimensions (query/page/country/device) get coerced to '' so
-- the PK can cover every row without a COALESCE-based unique index.

UPDATE "gsc_observations" SET "query" = '' WHERE "query" IS NULL;--> statement-breakpoint
UPDATE "gsc_observations" SET "page" = '' WHERE "page" IS NULL;--> statement-breakpoint
UPDATE "gsc_observations" SET "country" = '' WHERE "country" IS NULL;--> statement-breakpoint
UPDATE "gsc_observations" SET "device" = '' WHERE "device" IS NULL;--> statement-breakpoint

-- Collapse any duplicates that the previous schema allowed — keeps the
-- earliest row per natural key (the rest are exact re-fetches with the
-- same metrics anyway, so the choice is informational).
DELETE FROM "gsc_observations" a USING "gsc_observations" b
WHERE a.ctid > b.ctid
  AND a.observed_at = b.observed_at
  AND a.gsc_property_id = b.gsc_property_id
  AND a.query = b.query
  AND a.page = b.page
  AND a.country = b.country
  AND a.device = b.device;--> statement-breakpoint

DROP INDEX "gsc_observations_property_idx";--> statement-breakpoint
ALTER TABLE "gsc_observations" ALTER COLUMN "query" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "gsc_observations" ALTER COLUMN "query" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "gsc_observations" ALTER COLUMN "page" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "gsc_observations" ALTER COLUMN "page" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "gsc_observations" ALTER COLUMN "country" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "gsc_observations" ALTER COLUMN "country" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "gsc_observations" ALTER COLUMN "device" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "gsc_observations" ALTER COLUMN "device" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "gsc_observations" ADD CONSTRAINT "gsc_observations_observed_at_gsc_property_id_query_page_country_device_pk" PRIMARY KEY("observed_at","gsc_property_id","query","page","country","device");
