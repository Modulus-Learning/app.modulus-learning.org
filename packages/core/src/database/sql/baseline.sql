-- Baseline: the complete Modulus schema for a fresh, empty database.
-- Generated from the Drizzle schema with `pnpm schema:baseline`; review before
-- committing. Applied only by `modulus db init`, which records every release
-- script shipped with the same build as already applied.

CREATE TYPE "public"."user_login_outcome" AS ENUM('success', 'failed_no_password', 'failed_bad_password', 'failed_disabled');
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"url" varchar(255) NOT NULL,
	"name" varchar,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_url_unique" UNIQUE("url")
);

CREATE TABLE "activity_activity_code" (
	"activity_code_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	CONSTRAINT "activity_activity_code_activity_code_id_activity_id_pk" PRIMARY KEY("activity_code_id","activity_id")
);

CREATE TABLE "activity_code_member" (
	"activity_code_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_code_member_activity_code_id_user_id_pk" PRIMARY KEY("activity_code_id","user_id")
);

CREATE TABLE "activity_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_by" uuid,
	"code" varchar(255) NOT NULL,
	"private_code" varchar(255) NOT NULL,
	"url_prefix" varchar(255),
	"description" varchar(1024),
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "activity_codes_private_code_unique" UNIQUE("private_code")
);

CREATE TABLE "activity_url_allowlist_rules" (
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

CREATE TABLE "admin_permissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vid" integer DEFAULT 1 NOT NULL,
	"admin_role_id" uuid NOT NULL,
	"ability" varchar(128) NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "admin_reports_mau" (
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "admin_reports_mau_year_month_pk" PRIMARY KEY("year","month")
);

CREATE TABLE "admin_role_admin_user" (
	"admin_role_id" uuid NOT NULL,
	"admin_user_id" uuid NOT NULL,
	CONSTRAINT "admin_role_admin_user_admin_role_id_admin_user_id_pk" PRIMARY KEY("admin_role_id","admin_user_id")
);

CREATE TABLE "admin_roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vid" integer DEFAULT 1 NOT NULL,
	"name" varchar(128) NOT NULL,
	"machine_name" varchar(128) NOT NULL,
	"description" text,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_roles_machine_name_unique" UNIQUE("machine_name")
);

CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vid" integer DEFAULT 1 NOT NULL,
	"given_name" varchar(100),
	"family_name" varchar(100),
	"username" varchar(26),
	"email" varchar(254),
	"password" varchar(128),
	"remember_me" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"last_login" timestamp (6) with time zone DEFAULT now(),
	"last_login_ip" varchar(40) DEFAULT '0.0.0.0' NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"is_email_verified" boolean DEFAULT false NOT NULL,
	CONSTRAINT "admin_users_username_unique" UNIQUE("username"),
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);

CREATE TABLE "agent_auth_codes" (
	"code" varchar PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"scope_id" uuid DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL,
	"client_id" varchar NOT NULL,
	"redirect_uri" varchar NOT NULL,
	"code_challenge" varchar NOT NULL,
	"expires_at" timestamp (0) with time zone NOT NULL
);

CREATE TABLE "agent_refresh_tokens" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp (6) with time zone NOT NULL,
	"used_at" timestamp (6) with time zone
);

CREATE TABLE "email_change_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"email" varchar(254) NOT NULL,
	"verification_code" varchar(50) NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "enrollment" (
	"activity_code_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollment_activity_code_id_user_id_pk" PRIMARY KEY("activity_code_id","user_id")
);

CREATE TABLE "lti_lineitems" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"scope_id" uuid DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL,
	"platform_issuer" varchar NOT NULL,
	"deployment_id" varchar NOT NULL,
	"lineitem_url" varchar NOT NULL,
	"lti_user_id" varchar(255) NOT NULL,
	"cutoff_at" timestamp (6) with time zone,
	"dead_at" timestamp (6) with time zone,
	"submitted_progress" real DEFAULT 0 NOT NULL,
	"submitted_at" timestamp (6) with time zone,
	"submittable_progress" real NOT NULL,
	"submission_eligible_at" timestamp (6) with time zone,
	"submission_lease_expires_at" timestamp (6) with time zone,
	"submission_lease_token" uuid,
	"submission_error_count" integer DEFAULT 0 NOT NULL,
	"submission_error_category" text,
	"submission_error_message" text,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lti_lineitems_user_id_activity_id_lineitem_url_idx" UNIQUE("user_id","activity_id","lineitem_url")
);

CREATE TABLE "lti_nonces" (
	"nonce" varchar(40) PRIMARY KEY NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "lti_platform_deployments" (
	"platform_issuer" varchar NOT NULL,
	"deployment_id" varchar NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lti_platform_deployments_platform_issuer_deployment_id_pk" PRIMARY KEY("platform_issuer","deployment_id")
);

CREATE TABLE "lti_platform_health" (
	"platform_issuer" varchar PRIMARY KEY NOT NULL,
	"status" varchar DEFAULT 'healthy' NOT NULL,
	"paused_until" timestamp (6) with time zone,
	"last_success_at" timestamp (6) with time zone,
	"last_failure_at" timestamp (6) with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"open_incident_id" uuid,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "lti_platform_incidents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"platform_issuer" varchar NOT NULL,
	"opened_at" timestamp (6) with time zone NOT NULL,
	"last_failure_at" timestamp (6) with time zone NOT NULL,
	"resolved_at" timestamp (6) with time zone,
	"severity" varchar NOT NULL,
	"trigger_category" varchar NOT NULL,
	"categories_seen" varchar[] DEFAULT '{}'::varchar[] NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"distinct_affected_lineitems" integer DEFAULT 0 NOT NULL,
	"notified_at" timestamp (6) with time zone,
	"resolved_notified_at" timestamp (6) with time zone,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "lti_platforms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"issuer" varchar NOT NULL,
	"name" varchar NOT NULL,
	"client_id" varchar NOT NULL,
	"authorization_endpoint" varchar NOT NULL,
	"token_endpoint" varchar NOT NULL,
	"jwks_uri" varchar NOT NULL,
	"authorization_server" varchar NOT NULL,
	CONSTRAINT "lti_platforms_issuer_unique" UNIQUE("issuer")
);

CREATE TABLE "lti_submission_failures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"platform_issuer" varchar NOT NULL,
	"incident_id" uuid,
	"lineitem_id" uuid,
	"deployment_id" varchar,
	"occurred_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"category" varchar NOT NULL,
	"http_status" integer,
	"detail" text
);

CREATE TABLE "pending_deep_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"issuer" text NOT NULL,
	"deployment_id" text NOT NULL,
	"deep_linking_data" text,
	"return_url" text NOT NULL,
	"context" text,
	"expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE "page_state" (
	"user_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"scope_id" uuid DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL,
	"state" text DEFAULT '{}' NOT NULL,
	CONSTRAINT "page_state_user_id_activity_id_scope_id_pk" PRIMARY KEY("user_id","activity_id","scope_id")
);

CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vid" integer DEFAULT 1 NOT NULL,
	"role_id" uuid NOT NULL,
	"ability" varchar(128) NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "progress" (
	"activity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"scope_id" uuid DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL,
	"progress" real NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_activity_id_user_id_scope_id_pk" PRIMARY KEY("activity_id","user_id","scope_id")
);

CREATE TABLE "progress_events" (
	"submitted_at" timestamp (6) with time zone NOT NULL,
	"user_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"scope_id" uuid DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL,
	"source_activity_id" uuid,
	"progress" real NOT NULL
);

CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" varchar(100) NOT NULL,
	"username" varchar(26),
	"email" varchar(254) NOT NULL,
	"agreed_to_terms" boolean DEFAULT false NOT NULL,
	"is_email_verified" boolean DEFAULT false NOT NULL,
	"verification_code" varchar(50) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"ip" varchar(40) DEFAULT '0.0.0.0' NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registrations_username_unique" UNIQUE("username"),
	CONSTRAINT "registrations_email_unique" UNIQUE("email")
);

CREATE TABLE "role_user" (
	"role_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "role_user_role_id_user_id_pk" PRIMARY KEY("role_id","user_id")
);

CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vid" integer DEFAULT 1 NOT NULL,
	"name" varchar(128) NOT NULL,
	"machine_name" varchar(128) NOT NULL,
	"description" text,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_machine_name_unique" UNIQUE("machine_name")
);

CREATE TABLE "scopes" (
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

CREATE TABLE "user_logins" (
	"time" timestamp with time zone NOT NULL,
	"user_id" uuid,
	"provider" text NOT NULL,
	"ip_address" "inet",
	"outcome" "user_login_outcome" NOT NULL
);

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vid" integer DEFAULT 1 NOT NULL,
	"given_name" varchar(100),
	"family_name" varchar(100),
	"full_name" varchar(100),
	"username" varchar(26),
	"email" varchar(254),
	"password" varchar(128),
	"github_id" integer,
	"google_id" varchar(30),
	"remember_me" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"agreed_to_terms" boolean DEFAULT false NOT NULL,
	"last_provider" varchar(50),
	"last_login" timestamp (6) with time zone DEFAULT now(),
	"last_login_ip" varchar(40) DEFAULT '0.0.0.0' NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"is_email_verified" boolean DEFAULT false NOT NULL,
	"lti_iss" varchar,
	"lti_sub" varchar(255),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);

ALTER TABLE "activity_activity_code" ADD CONSTRAINT "activity_activity_code_activity_code_id_activity_codes_id_fk" FOREIGN KEY ("activity_code_id") REFERENCES "public"."activity_codes"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "activity_activity_code" ADD CONSTRAINT "activity_activity_code_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_code_member" ADD CONSTRAINT "activity_code_member_activity_code_id_activity_codes_id_fk" FOREIGN KEY ("activity_code_id") REFERENCES "public"."activity_codes"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_code_member" ADD CONSTRAINT "activity_code_member_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_codes" ADD CONSTRAINT "activity_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "activity_url_allowlist_rules" ADD CONSTRAINT "activity_url_allowlist_rules_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "activity_url_allowlist_rules" ADD CONSTRAINT "activity_url_allowlist_rules_updated_by_admin_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "admin_permissions" ADD CONSTRAINT "admin_permissions_admin_role_id_admin_roles_id_fk" FOREIGN KEY ("admin_role_id") REFERENCES "public"."admin_roles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "admin_role_admin_user" ADD CONSTRAINT "admin_role_admin_user_admin_role_id_admin_roles_id_fk" FOREIGN KEY ("admin_role_id") REFERENCES "public"."admin_roles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "admin_role_admin_user" ADD CONSTRAINT "admin_role_admin_user_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agent_auth_codes" ADD CONSTRAINT "agent_auth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agent_auth_codes" ADD CONSTRAINT "agent_auth_codes_scope_id_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "agent_refresh_tokens" ADD CONSTRAINT "agent_refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_activity_code_id_activity_codes_id_fk" FOREIGN KEY ("activity_code_id") REFERENCES "public"."activity_codes"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lti_lineitems" ADD CONSTRAINT "lti_lineitems_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lti_lineitems" ADD CONSTRAINT "lti_lineitems_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lti_lineitems" ADD CONSTRAINT "lti_lineitems_scope_id_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "lti_lineitems" ADD CONSTRAINT "lti_lineitems_platform_issuer_deployment_id_fk" FOREIGN KEY ("platform_issuer","deployment_id") REFERENCES "public"."lti_platform_deployments"("platform_issuer","deployment_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "lti_platform_deployments" ADD CONSTRAINT "lti_platform_deployments_platform_issuer_lti_platforms_issuer_fk" FOREIGN KEY ("platform_issuer") REFERENCES "public"."lti_platforms"("issuer") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lti_platform_health" ADD CONSTRAINT "lti_platform_health_platform_issuer_lti_platforms_issuer_fk" FOREIGN KEY ("platform_issuer") REFERENCES "public"."lti_platforms"("issuer") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lti_platform_health" ADD CONSTRAINT "lti_platform_health_open_incident_id_lti_platform_incidents_id_fk" FOREIGN KEY ("open_incident_id") REFERENCES "public"."lti_platform_incidents"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "lti_platform_incidents" ADD CONSTRAINT "lti_platform_incidents_platform_issuer_lti_platforms_issuer_fk" FOREIGN KEY ("platform_issuer") REFERENCES "public"."lti_platforms"("issuer") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lti_submission_failures" ADD CONSTRAINT "lti_submission_failures_platform_issuer_lti_platforms_issuer_fk" FOREIGN KEY ("platform_issuer") REFERENCES "public"."lti_platforms"("issuer") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lti_submission_failures" ADD CONSTRAINT "lti_submission_failures_incident_id_lti_platform_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."lti_platform_incidents"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "pending_deep_links" ADD CONSTRAINT "pending_deep_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "page_state" ADD CONSTRAINT "page_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "page_state" ADD CONSTRAINT "page_state_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "page_state" ADD CONSTRAINT "page_state_scope_id_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "progress" ADD CONSTRAINT "progress_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "progress" ADD CONSTRAINT "progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "progress" ADD CONSTRAINT "progress_scope_id_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "progress_events" ADD CONSTRAINT "progress_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "progress_events" ADD CONSTRAINT "progress_events_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "progress_events" ADD CONSTRAINT "progress_events_scope_id_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "progress_events" ADD CONSTRAINT "progress_events_source_activity_id_activities_id_fk" FOREIGN KEY ("source_activity_id") REFERENCES "public"."activities"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "role_user" ADD CONSTRAINT "role_user_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "role_user" ADD CONSTRAINT "role_user_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "scopes" ADD CONSTRAINT "scopes_platform_id_lti_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."lti_platforms"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX "user_id_idx" ON "email_change_requests" USING btree ("user_id");
CREATE INDEX "verification_code_idx" ON "email_change_requests" USING btree ("verification_code");
CREATE INDEX "lti_lineitems_user_id_activity_id_idx" ON "lti_lineitems" USING btree ("user_id","activity_id");
CREATE INDEX "lti_lineitems_eligible_idx" ON "lti_lineitems" USING btree ("platform_issuer","submission_eligible_at") WHERE "lti_lineitems"."dead_at" IS NULL AND "lti_lineitems"."submittable_progress" > "lti_lineitems"."submitted_progress";
CREATE UNIQUE INDEX "lti_platform_incidents_one_open_idx" ON "lti_platform_incidents" USING btree ("platform_issuer") WHERE "lti_platform_incidents"."resolved_at" IS NULL;
CREATE INDEX "lti_platform_incidents_unnotified_idx" ON "lti_platform_incidents" USING btree ("opened_at") WHERE "lti_platform_incidents"."resolved_at" IS NULL AND "lti_platform_incidents"."notified_at" IS NULL;
CREATE INDEX "lti_platform_incidents_allclear_idx" ON "lti_platform_incidents" USING btree ("resolved_at") WHERE "lti_platform_incidents"."notified_at" IS NOT NULL AND "lti_platform_incidents"."resolved_notified_at" IS NULL;
CREATE INDEX "lti_platform_incidents_issuer_time_idx" ON "lti_platform_incidents" USING btree ("platform_issuer","opened_at");
CREATE INDEX "lti_submission_failures_issuer_time_idx" ON "lti_submission_failures" USING btree ("platform_issuer","occurred_at");
CREATE INDEX "lti_submission_failures_incident_idx" ON "lti_submission_failures" USING btree ("incident_id");
CREATE INDEX "lti_submission_failures_isolated_idx" ON "lti_submission_failures" USING btree ("platform_issuer","category","occurred_at") WHERE "lti_submission_failures"."incident_id" IS NULL;
CREATE INDEX "progress_events_activity_id_scope_id_idx" ON "progress_events" USING btree ("activity_id","scope_id","submitted_at" DESC NULLS LAST);
CREATE INDEX "progress_events_user_id_activity_id_scope_id_idx" ON "progress_events" USING btree ("user_id","activity_id","scope_id","submitted_at" DESC NULLS LAST);
CREATE INDEX "user_logins_time_idx" ON "user_logins" USING btree ("time" DESC NULLS LAST);
CREATE INDEX "user_logins_outcome_idx" ON "user_logins" USING btree ("outcome","time" DESC NULLS LAST);
CREATE INDEX "user_logins_time_outcome_idx" ON "user_logins" USING btree ("time" DESC NULLS LAST,"outcome");
CREATE INDEX "full_name_idx" ON "users" USING btree ("full_name");
CREATE INDEX "github_id" ON "users" USING btree ("github_id");
CREATE INDEX "google_id" ON "users" USING btree ("google_id");
CREATE UNIQUE INDEX "users_lti_identity_idx" ON "users" USING btree ("lti_iss","lti_sub") WHERE "users"."lti_iss" IS NOT NULL AND "users"."lti_sub" IS NOT NULL;
