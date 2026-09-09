-- Migration: activity-url-allowlist - adds the new
--   activity_url_allowlist_rules table.
-- Date: 2026-09-09
-- Mirrors Drizzle migration
-- * 0016_sad_jackpot.sql
--
-- Safe to re-run

-- Wrap entire migration in a transaction.
BEGIN;

CREATE TABLE IF NOT EXISTS "activity_url_allowlist_rules" (
    "id" uuid PRIMARY KEY NOT NULL,
    "origin" varchar(255) NOT NULL,
    "path_prefix" varchar(255) DEFAULT '/' NOT NULL,
    "description" varchar(1024),
    "is_enabled" boolean DEFAULT true NOT NULL,
    "created_by" uuid,
    "updated_by" uuid,
    "created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "activity_url_allowlist_rules_origin_path_prefix_idx" UNIQUE("origin","path_prefix")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'activity_url_allowlist_rules_created_by_admin_users_id_fk'
    ) THEN
        ALTER TABLE "activity_url_allowlist_rules" ADD CONSTRAINT "activity_url_allowlist_rules_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'activity_url_allowlist_rules_updated_by_admin_users_id_fk'
    ) THEN
        ALTER TABLE "activity_url_allowlist_rules" ADD CONSTRAINT "activity_url_allowlist_rules_updated_by_admin_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
    END IF;
END $$;

COMMIT;
