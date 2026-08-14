-- Migration: activity_codes - add an optional, free-text description column so
-- instructors can record why an activity code was created and how it's being
-- used alongside its associated activity URLs / assignments.
-- Date: 2026-05-29
-- Mirrors Drizzle migration 0006_noisy_lifeguard.sql.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS is a no-op when the column already
-- exists.

BEGIN;

ALTER TABLE activity_codes
    ADD COLUMN IF NOT EXISTS description varchar(1024);

COMMIT;
