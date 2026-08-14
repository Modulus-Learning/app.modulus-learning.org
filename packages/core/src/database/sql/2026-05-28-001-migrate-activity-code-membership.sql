-- Migration: activity_codes - introduce activity_code_member join table and
-- convert activity_codes.user_id (single owner) into activity_codes.created_by
-- (attribution-only, nullable) plus a many-to-many membership table.
-- Date: 2026-05-28
-- Mirrors Drizzle migration 0005_classy_unus.sql.
--
-- Safe to re-run: every step is guarded by a column / constraint / row check,
-- so re-running on an already-migrated database is a no-op.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Create the activity_code_member join table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_code_member (
    activity_code_id uuid NOT NULL,
    user_id          uuid NOT NULL,
    created_at       timestamp(6) WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT activity_code_member_activity_code_id_user_id_pk
        PRIMARY KEY (activity_code_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 2. Add foreign keys on activity_code_member (idempotent via pg_constraint).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'activity_code_member_activity_code_id_activity_codes_id_fk'
    ) THEN
        ALTER TABLE activity_code_member
            ADD CONSTRAINT activity_code_member_activity_code_id_activity_codes_id_fk
            FOREIGN KEY (activity_code_id)
            REFERENCES activity_codes(id)
            ON DELETE CASCADE
            ON UPDATE NO ACTION;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'activity_code_member_user_id_users_id_fk'
    ) THEN
        ALTER TABLE activity_code_member
            ADD CONSTRAINT activity_code_member_user_id_users_id_fk
            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
            ON UPDATE NO ACTION;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Backfill membership rows from the existing single-owner column, rename
--    the column, drop NOT NULL, and swap the FK to ON DELETE SET NULL.
--
--    Wrapped in a single DO block so the backfill SELECT only runs while
--    activity_codes.user_id still exists. On a re-run all of these steps
--    are skipped because the column has already been renamed.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'activity_codes'
          AND column_name  = 'user_id'
    ) THEN
        -- 3a. Backfill: every existing owner becomes a member of their code.
        INSERT INTO activity_code_member (activity_code_id, user_id)
        SELECT id, user_id FROM activity_codes
        ON CONFLICT DO NOTHING;

        -- 3b. Drop the old ON DELETE CASCADE FK before renaming.
        IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'activity_codes_user_id_users_id_fk'
        ) THEN
            ALTER TABLE activity_codes
                DROP CONSTRAINT activity_codes_user_id_users_id_fk;
        END IF;

        -- 3c. Rename user_id -> created_by and relax it to nullable.
        ALTER TABLE activity_codes RENAME COLUMN user_id TO created_by;
        ALTER TABLE activity_codes ALTER COLUMN created_by DROP NOT NULL;
    END IF;

    -- 3d. Ensure the new FK is present (covers both fresh and re-run paths).
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'activity_codes_created_by_users_id_fk'
    ) THEN
        ALTER TABLE activity_codes
            ADD CONSTRAINT activity_codes_created_by_users_id_fk
            FOREIGN KEY (created_by)
            REFERENCES users(id)
            ON DELETE SET NULL
            ON UPDATE NO ACTION;
    END IF;
END $$;

COMMIT;
