-- Migration: platform_health_submission_events - add a table to track LTI
-- platform submission-queue health, and an event store for LTI submission
-- errors.
-- Date: 2026-06-10
-- Mirrors Drizzle migration 0007_tiresome_lady_deathstrike.sql.
--
-- Safe to re-run: see comments below.

-- Create platform health table (IF NOT EXISTS makes this idempotent)
CREATE TABLE IF NOT EXISTS "lti_platform_health" (
	"platform_issuer" varchar PRIMARY KEY NOT NULL,
	"status" varchar DEFAULT 'healthy' NOT NULL,
	"paused_until" timestamp (6) with time zone,
	"last_success_at" timestamp (6) with time zone,
	"last_failure_at" timestamp (6) with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);

-- Create submission event table (IF NOT EXISTS makes this idempotent)
CREATE TABLE IF NOT EXISTS "lti_submission_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"platform_issuer" varchar NOT NULL,
	"deployment_id" varchar,
	"lineitem_id" uuid,
	"occurred_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"outcome" varchar NOT NULL,
	"category" varchar,
	"http_status" integer,
	"detail" text
);

-- Add new columns to lti_lineitems (IF NOT EXISTS makes these idempotent)
ALTER TABLE "lti_lineitems" ADD COLUMN IF NOT EXISTS "submission_status" varchar DEFAULT 'ready' NOT NULL;
ALTER TABLE "lti_lineitems" ADD COLUMN IF NOT EXISTS "submission_locked_until" timestamp (6) with time zone;
ALTER TABLE "lti_lineitems" ADD COLUMN IF NOT EXISTS "submission_error_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "lti_lineitems" ADD COLUMN IF NOT EXISTS "submission_error_category" text;
ALTER TABLE "lti_lineitems" ADD COLUMN IF NOT EXISTS "submission_error_message" text;
ALTER TABLE "lti_lineitems" ADD COLUMN IF NOT EXISTS "created_at" timestamp (6) with time zone DEFAULT now() NOT NULL;
ALTER TABLE "lti_lineitems" ADD COLUMN IF NOT EXISTS "updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL;

-- Add foreign key constraints (idempotent via IF NOT EXISTS (SELECT ...))
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'lti_platform_health_platform_issuer_lti_platforms_issuer_fk'
    ) THEN
        ALTER TABLE "lti_platform_health"
            ADD CONSTRAINT "lti_platform_health_platform_issuer_lti_platforms_issuer_fk"
            FOREIGN KEY ("platform_issuer")
            REFERENCES "public"."lti_platforms"("issuer")
            ON DELETE cascade
            ON UPDATE no action;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'lti_submission_events_platform_issuer_lti_platforms_issuer_fk'
    ) THEN
        ALTER TABLE "lti_submission_events"
            ADD CONSTRAINT "lti_submission_events_platform_issuer_lti_platforms_issuer_fk"
            FOREIGN KEY ("platform_issuer")
            REFERENCES "public"."lti_platforms"("issuer")
            ON DELETE cascade
            ON UPDATE no action;
    END IF;
END $$;

-- Add index to submission events table (IF NOT EXISTS makes this idempotent)
CREATE INDEX IF NOT EXISTS "lti_submission_events_issuer_time_idx" ON "lti_submission_events" USING btree ("platform_issuer","occurred_at");

-- Drop old columns from lti_lineitems (IF EXISTS makes these idempotent)
ALTER TABLE "lti_lineitems" DROP COLUMN IF EXISTS "submission_locked_at";
ALTER TABLE "lti_lineitems" DROP COLUMN IF EXISTS "submission_attempts";
ALTER TABLE "lti_lineitems" DROP COLUMN IF EXISTS "submission_next_retry_at";
ALTER TABLE "lti_lineitems" DROP COLUMN IF EXISTS "submission_last_error";
