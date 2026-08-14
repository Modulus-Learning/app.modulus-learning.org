-- Migration: activity-scopes - adds scopes table,
--   and adds scope_id foreign key to progress,
--   progress_events, page_state, lti_lineitems and
--   agent_auth_codes tables.
-- Date: 2026-08-14
-- Mirrors Drizzle migration
-- * 0014_black_blur.sql
--
-- Safe to re-run

BEGIN;

CREATE TABLE IF NOT EXISTS "scopes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"platform_id" uuid,
	"external_id" text,
	"name" text,
	"starts_at" timestamp (6) with time zone,
	"ends_at" timestamp (6) with time zone,
	"last_verified_launch_at" timestamp (6) with time zone,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scopes_platform_id_external_id_unique" UNIQUE("platform_id","external_id"),
	CONSTRAINT "scopes_identity_check" CHECK ((
        ("scopes"."id" = '00000000-0000-0000-0000-000000000000'::uuid AND "scopes"."platform_id" IS NULL AND "scopes"."external_id" IS NULL)
        OR
        ("scopes"."id" <> '00000000-0000-0000-0000-000000000000'::uuid AND "scopes"."platform_id" IS NOT NULL AND "scopes"."external_id" IS NOT NULL)
      ))
);

INSERT INTO "scopes" ("id") VALUES ('00000000-0000-0000-0000-000000000000') ON CONFLICT DO NOTHING;
DROP INDEX IF EXISTS "progress_events_activity_id_idx";
DROP INDEX IF EXISTS "progress_events_user_id_activity_id_idx";

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'page_state_user_id_activity_id_pk'
    ) THEN
        ALTER TABLE "page_state" DROP CONSTRAINT "page_state_user_id_activity_id_pk";
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'progress_activity_id_user_id_pk'
    ) THEN
        ALTER TABLE "progress" DROP CONSTRAINT "progress_activity_id_user_id_pk";
    END IF;
END $$;

ALTER TABLE "agent_auth_codes" ADD COLUMN IF NOT EXISTS "scope_id" uuid DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL;
ALTER TABLE "lti_lineitems" ADD COLUMN IF NOT EXISTS "scope_id" uuid DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL;
ALTER TABLE "page_state" ADD COLUMN IF NOT EXISTS "scope_id" uuid DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL;
ALTER TABLE "progress" ADD COLUMN IF NOT EXISTS "scope_id" uuid DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL;
ALTER TABLE "progress_events" ADD COLUMN IF NOT EXISTS "scope_id" uuid DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'page_state_user_id_activity_id_scope_id_pk'
    ) THEN
        ALTER TABLE "page_state"
            ADD CONSTRAINT "page_state_user_id_activity_id_scope_id_pk"
            PRIMARY KEY("user_id","activity_id","scope_id");
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'progress_activity_id_user_id_scope_id_pk'
    ) THEN
        ALTER TABLE "progress"
            ADD CONSTRAINT "progress_activity_id_user_id_scope_id_pk"
            PRIMARY KEY("activity_id","user_id","scope_id");
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'scopes_platform_id_lti_platforms_id_fk'
    ) THEN
        ALTER TABLE "scopes"
            ADD CONSTRAINT "scopes_platform_id_lti_platforms_id_fk"
            FOREIGN KEY ("platform_id")
            REFERENCES "public"."lti_platforms"("id")
            ON DELETE restrict
            ON UPDATE no action;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'agent_auth_codes_scope_id_scopes_id_fk'
    ) THEN
        ALTER TABLE "agent_auth_codes"
            ADD CONSTRAINT "agent_auth_codes_scope_id_scopes_id_fk"
            FOREIGN KEY ("scope_id")
            REFERENCES "public"."scopes"("id")
            ON DELETE restrict
            ON UPDATE no action;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'lti_lineitems_scope_id_scopes_id_fk'
    ) THEN
        ALTER TABLE "lti_lineitems"
            ADD CONSTRAINT "lti_lineitems_scope_id_scopes_id_fk"
            FOREIGN KEY ("scope_id")
            REFERENCES "public"."scopes"("id")
            ON DELETE restrict
            ON UPDATE no action;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'page_state_scope_id_scopes_id_fk'
    ) THEN
        ALTER TABLE "page_state"
            ADD CONSTRAINT "page_state_scope_id_scopes_id_fk"
            FOREIGN KEY ("scope_id")
            REFERENCES "public"."scopes"("id")
            ON DELETE restrict
            ON UPDATE no action;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'progress_scope_id_scopes_id_fk'
    ) THEN
        ALTER TABLE "progress"
            ADD CONSTRAINT "progress_scope_id_scopes_id_fk"
            FOREIGN KEY ("scope_id")
            REFERENCES "public"."scopes"("id")
            ON DELETE restrict
            ON UPDATE no action;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'progress_events_scope_id_scopes_id_fk'
    ) THEN
        ALTER TABLE "progress_events"
            ADD CONSTRAINT "progress_events_scope_id_scopes_id_fk"
            FOREIGN KEY ("scope_id")
            REFERENCES "public"."scopes"("id")
            ON DELETE restrict
            ON UPDATE no action;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "progress_events_activity_id_scope_id_idx"
    ON "progress_events"
    USING btree ("activity_id","scope_id","submitted_at" DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS "progress_events_user_id_activity_id_scope_id_idx"
    ON "progress_events"
    USING btree ("user_id","activity_id","scope_id","submitted_at" DESC NULLS LAST);

CREATE UNIQUE INDEX IF NOT EXISTS "users_lti_identity_idx"
    ON "users"
    USING btree ("lti_iss","lti_sub")
    WHERE "users"."lti_iss" IS NOT NULL
      AND "users"."lti_sub" IS NOT NULL;

COMMIT;
