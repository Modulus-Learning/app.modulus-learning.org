-- Migration: activity-code-enrollment - drops the activity_id
--   column from the enrollment table, and adds a created_at column.
-- Date: 2026-08-25
-- Mirrors Drizzle migration
-- * 0015_red_shriek.sql
--
-- Safe to re-run

-- Wrap entire migration in a transaction.
BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'enrollment_activity_id_activities_id_fk'
    ) THEN
        ALTER TABLE "enrollment" DROP CONSTRAINT "enrollment_activity_id_activities_id_fk";
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'enrollment_activity_code_id_activity_id_user_id_pk'
    ) THEN
        ALTER TABLE "enrollment" DROP CONSTRAINT "enrollment_activity_code_id_activity_id_user_id_pk";
    END IF;
END $$;

DELETE FROM "enrollment" t1
USING "enrollment" t2
WHERE t1.ctid < t2.ctid
AND t1.activity_code_id = t2.activity_code_id
AND t1.user_id = t2.user_id;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'enrollment_activity_code_id_user_id_pk'
    ) THEN
        ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_activity_code_id_user_id_pk" PRIMARY KEY("activity_code_id","user_id");
    END IF;
END $$;

ALTER TABLE "enrollment" ADD COLUMN IF NOT EXISTS "created_at" timestamp (6) with time zone DEFAULT now() NOT NULL;
ALTER TABLE "enrollment" DROP COLUMN IF EXISTS "activity_id";

COMMIT;
