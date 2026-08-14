-- Migration: progress-events - add progress_events table.
-- Date: 2026-06-30
-- Mirrors Drizzle migrations
-- * 0008_narrow_rachel_grey.sql
-- * 0010_equal_kat_farrell.sql
--
-- Safe to re-run: everything gated by IF NOT EXISTS

-- 0008_narrow_rachel_grey.sql

CREATE TABLE IF NOT EXISTS "progress_events" (
	"submitted_at" timestamp (6) with time zone NOT NULL,
	"user_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"progress" real NOT NULL
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'progress_events_user_id_users_id_fk'
    ) THEN
        ALTER TABLE "progress_events"
            ADD CONSTRAINT "progress_events_user_id_users_id_fk"
            FOREIGN KEY ("user_id")
            REFERENCES "public"."users"("id")
            ON DELETE cascade
            ON UPDATE no action;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'progress_events_activity_id_activities_id_fk'
    ) THEN
        ALTER TABLE "progress_events"
        ADD CONSTRAINT "progress_events_activity_id_activities_id_fk"
        FOREIGN KEY ("activity_id")
        REFERENCES "public"."activities"("id")
        ON DELETE restrict
        ON UPDATE no action;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "progress_events_activity_id_idx" ON "progress_events" USING btree ("activity_id","submitted_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "progress_events_user_id_activity_id_idx" ON "progress_events" USING btree ("user_id","activity_id","submitted_at" DESC NULLS LAST);

-- 0010_equal_kat_farrell.sql

ALTER TABLE "progress_events" ADD COLUMN IF NOT EXISTS "source_activity_id" uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'progress_events_source_activity_id_activities_id_fk'
    ) THEN
        ALTER TABLE "progress_events"
        ADD CONSTRAINT "progress_events_source_activity_id_activities_id_fk"
        FOREIGN KEY ("source_activity_id")
        REFERENCES "public"."activities"("id")
        ON DELETE restrict
        ON UPDATE no action;
    END IF;
END $$;
