-- Migration: grant-manager-abilities - brings an existing Manager admin role up
--   to the reference data for four abilities: lti-platforms:read and
--   lti-platforms:edit, which editable LTI registration endpoints adds, and
--   activity-url-allowlist:list and activity-url-allowlist:manage, which the
--   activity URL allowlist release added to the reference data only and never
--   granted to existing databases. A database without a 'manager' role is left
--   unchanged.
-- Date: 2026-11-12
-- Data only; no Drizzle migration.
--
-- Safe to re-run

BEGIN;

INSERT INTO "admin_permissions" ("id", "admin_role_id", "ability")
SELECT uuidv7(), r."id", 'lti-platforms:read'
FROM "admin_roles" r
WHERE r."machine_name" = 'manager'
  AND NOT EXISTS (
    SELECT 1 FROM "admin_permissions" p
    WHERE p."admin_role_id" = r."id" AND p."ability" = 'lti-platforms:read'
  );

INSERT INTO "admin_permissions" ("id", "admin_role_id", "ability")
SELECT uuidv7(), r."id", 'lti-platforms:edit'
FROM "admin_roles" r
WHERE r."machine_name" = 'manager'
  AND NOT EXISTS (
    SELECT 1 FROM "admin_permissions" p
    WHERE p."admin_role_id" = r."id" AND p."ability" = 'lti-platforms:edit'
  );

INSERT INTO "admin_permissions" ("id", "admin_role_id", "ability")
SELECT uuidv7(), r."id", 'activity-url-allowlist:list'
FROM "admin_roles" r
WHERE r."machine_name" = 'manager'
  AND NOT EXISTS (
    SELECT 1 FROM "admin_permissions" p
    WHERE p."admin_role_id" = r."id" AND p."ability" = 'activity-url-allowlist:list'
  );

INSERT INTO "admin_permissions" ("id", "admin_role_id", "ability")
SELECT uuidv7(), r."id", 'activity-url-allowlist:manage'
FROM "admin_roles" r
WHERE r."machine_name" = 'manager'
  AND NOT EXISTS (
    SELECT 1 FROM "admin_permissions" p
    WHERE p."admin_role_id" = r."id" AND p."ability" = 'activity-url-allowlist:manage'
  );

COMMIT;
