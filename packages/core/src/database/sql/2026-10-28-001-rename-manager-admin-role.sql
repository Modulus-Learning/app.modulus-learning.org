-- Migration: rename-manager-admin-role - corrects the Manager admin role's
--   machine name from 'manger' to 'manager', which the admin-users role filter
--   and the production bootstrap use.
-- Date: 2026-10-28
-- Data only; no Drizzle migration.
--
-- Safe to re-run

BEGIN;

UPDATE "admin_roles"
SET "machine_name" = 'manager', "updated_at" = now()
WHERE "machine_name" = 'manger'
  AND NOT EXISTS (SELECT 1 FROM "admin_roles" WHERE "machine_name" = 'manager');

COMMIT;
