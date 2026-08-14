-- Migration: lti-submission-subsystem - overhaul of most
-- tables involved in lti submissions.
-- Date: 2026-06-30
-- Mirrors Drizzle migrations
-- * 0009_round_shotgun.sql
-- * 0011_charming_baron_zemo.sql
-- * 0012_rich_imperial_guard.sql
--
-- Safe to re-run: IF [NOT] EXISTS guards every non-idempotent statement

-- 0009_round_shotgun.sql

ALTER TABLE "lti_lineitems" ADD COLUMN IF NOT EXISTS "cutoff_at" timestamp (6) with time zone;

-- 0011_charming_baron_zemo.sql

ALTER TABLE "lti_lineitems" ALTER COLUMN "submitted_progress" SET DEFAULT 0;
ALTER TABLE "lti_lineitems" ADD COLUMN IF NOT EXISTS "dead_at" timestamp (6) with time zone;
ALTER TABLE "lti_lineitems" ADD COLUMN IF NOT EXISTS "submittable_progress" real NOT NULL DEFAULT 0;
ALTER TABLE "lti_lineitems" ALTER COLUMN "submittable_progress" DROP DEFAULT;
ALTER TABLE "lti_lineitems" ADD COLUMN IF NOT EXISTS "submission_eligible_at" timestamp (6) with time zone;
ALTER TABLE "lti_lineitems" ADD COLUMN IF NOT EXISTS "submission_lease_expires_at" timestamp (6) with time zone;
ALTER TABLE "lti_lineitems" ADD COLUMN IF NOT EXISTS "submission_lease_token" uuid;
CREATE INDEX IF NOT EXISTS "lti_lineitems_eligible_idx" ON "lti_lineitems" USING btree ("platform_issuer","submission_eligible_at") WHERE "lti_lineitems"."dead_at" IS NULL AND "lti_lineitems"."submittable_progress" > "lti_lineitems"."submitted_progress";
ALTER TABLE "lti_lineitems" DROP COLUMN IF EXISTS "submission_status";
ALTER TABLE "lti_lineitems" DROP COLUMN IF EXISTS "submission_locked_until";

-- 0012_rich_imperial_guard.sql

CREATE TABLE IF NOT EXISTS "lti_platform_incidents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"platform_issuer" varchar NOT NULL,
	"opened_at" timestamp (6) with time zone NOT NULL,
	"last_failure_at" timestamp (6) with time zone NOT NULL,
	"resolved_at" timestamp (6) with time zone,
	"severity" varchar NOT NULL,
	"trigger_category" varchar NOT NULL,
	"categories_seen" varchar[] DEFAULT '{}'::varchar[] NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"distinct_affected_lineitems" integer DEFAULT 0 NOT NULL,
	"notified_at" timestamp (6) with time zone,
	"resolved_notified_at" timestamp (6) with time zone,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "lti_submission_failures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"platform_issuer" varchar NOT NULL,
	"incident_id" uuid,
	"lineitem_id" uuid,
	"deployment_id" varchar,
	"occurred_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"category" varchar NOT NULL,
	"http_status" integer,
	"detail" text
);

ALTER TABLE IF EXISTS "lti_submission_events" DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS "lti_submission_events" CASCADE;
ALTER TABLE "lti_platform_health" ADD COLUMN IF NOT EXISTS "open_incident_id" uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'lti_platform_incidents_platform_issuer_lti_platforms_issuer_fk'
    ) THEN
        ALTER TABLE "lti_platform_incidents"
        ADD CONSTRAINT "lti_platform_incidents_platform_issuer_lti_platforms_issuer_fk"
        FOREIGN KEY ("platform_issuer")
        REFERENCES "public"."lti_platforms"("issuer")
        ON DELETE cascade
        ON UPDATE no action;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'lti_submission_failures_platform_issuer_lti_platforms_issuer_fk'
    ) THEN
        ALTER TABLE "lti_submission_failures"
        ADD CONSTRAINT "lti_submission_failures_platform_issuer_lti_platforms_issuer_fk"
        FOREIGN KEY ("platform_issuer")
        REFERENCES "public"."lti_platforms"("issuer")
        ON DELETE cascade
        ON UPDATE no action;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'lti_submission_failures_incident_id_lti_platform_incidents_id_fk'
    ) THEN
        ALTER TABLE "lti_submission_failures"
        ADD CONSTRAINT "lti_submission_failures_incident_id_lti_platform_incidents_id_fk"
        FOREIGN KEY ("incident_id")
        REFERENCES "public"."lti_platform_incidents"("id")
        ON DELETE set null
        ON UPDATE no action;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "lti_platform_incidents_one_open_idx" ON "lti_platform_incidents" USING btree ("platform_issuer") WHERE "lti_platform_incidents"."resolved_at" IS NULL;
CREATE INDEX IF NOT EXISTS "lti_platform_incidents_unnotified_idx" ON "lti_platform_incidents" USING btree ("opened_at") WHERE "lti_platform_incidents"."resolved_at" IS NULL AND "lti_platform_incidents"."notified_at" IS NULL;
CREATE INDEX IF NOT EXISTS "lti_platform_incidents_allclear_idx" ON "lti_platform_incidents" USING btree ("resolved_at") WHERE "lti_platform_incidents"."notified_at" IS NOT NULL AND "lti_platform_incidents"."resolved_notified_at" IS NULL;
CREATE INDEX IF NOT EXISTS "lti_platform_incidents_issuer_time_idx" ON "lti_platform_incidents" USING btree ("platform_issuer","opened_at");
CREATE INDEX IF NOT EXISTS "lti_submission_failures_issuer_time_idx" ON "lti_submission_failures" USING btree ("platform_issuer","occurred_at");
CREATE INDEX IF NOT EXISTS "lti_submission_failures_incident_idx" ON "lti_submission_failures" USING btree ("incident_id");
CREATE INDEX IF NOT EXISTS "lti_submission_failures_isolated_idx" ON "lti_submission_failures" USING btree ("platform_issuer","category","occurred_at") WHERE "lti_submission_failures"."incident_id" IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'lti_platform_health_open_incident_id_lti_platform_incidents_id_fk'
    ) THEN
        ALTER TABLE "lti_platform_health"
        ADD CONSTRAINT "lti_platform_health_open_incident_id_lti_platform_incidents_id_fk"
        FOREIGN KEY ("open_incident_id")
        REFERENCES "public"."lti_platform_incidents"("id")
        ON DELETE set
        null ON UPDATE no action;
    END IF;
END $$;
