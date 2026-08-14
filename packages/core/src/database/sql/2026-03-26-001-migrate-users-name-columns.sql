-- Migration: users - migrate first_name/last_name to given_name/family_name
-- Date: 2026-03-26
-- Description: Copies data from first_name/last_name into given_name/family_name
--              (only where the target columns are currently NULL), then drops
--              the old columns.

BEGIN;

-- Add the new columns (IF NOT EXISTS keeps this idempotent)
ALTER TABLE users ADD COLUMN IF NOT EXISTS given_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS family_name VARCHAR(100);

COMMIT;
