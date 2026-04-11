-- Migration: admin_users - migrate first_name/last_name to given_name/family_name
-- Date: 2026-03-26
-- Description: Copies data from first_name/last_name into given_name/family_name
--              (only where the target columns are currently NULL), then drops
--              the old columns.

BEGIN;

-- Add the new columns (IF NOT EXISTS keeps this idempotent)
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS given_name VARCHAR(100);
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS family_name VARCHAR(100);

-- Copy data from old columns to new columns where new columns are NULL
UPDATE admin_users
SET
  given_name  = COALESCE(given_name, first_name),
  family_name = COALESCE(family_name, last_name);

-- Drop the old columns
ALTER TABLE admin_users DROP COLUMN IF EXISTS first_name;
ALTER TABLE admin_users DROP COLUMN IF EXISTS last_name;

COMMIT;
