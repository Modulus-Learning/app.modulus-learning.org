-- Migration: pending-deep-links - replaces the old
--   lti_launches table with the new pending_deep_links table.
-- Date: 2026-08-14
-- Mirrors Drizzle migration
-- * 0013_fantastic_scream.sql
--
-- Safe to re-run

CREATE TABLE IF NOT EXISTS "pending_deep_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"issuer" text NOT NULL,
	"deployment_id" text NOT NULL,
	"deep_linking_data" text,
	"return_url" text NOT NULL,
	"context" text,
	"expires_at" timestamp with time zone NOT NULL
);

-- Deferred.
-- DROP TABLE IF EXISTS "lti_launches" CASCADE;

-- Add foreign key constraints (idempotent via IF NOT EXISTS (SELECT ...))
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'pending_deep_links_user_id_users_id_fk'
    ) THEN
        ALTER TABLE "pending_deep_links"
            ADD CONSTRAINT "pending_deep_links_user_id_users_id_fk"
            FOREIGN KEY ("user_id")
            REFERENCES "public"."users"("id")
            ON DELETE cascade ON
            UPDATE no action;
    END IF;
END $$;
