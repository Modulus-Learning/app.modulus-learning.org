CREATE TYPE "public"."user_login_outcome" AS ENUM('success', 'failed_no_password', 'failed_bad_password', 'failed_disabled');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"url" varchar(255) NOT NULL,
	"name" varchar,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "activity_activity_code" (
	"activity_code_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	CONSTRAINT "activity_activity_code_activity_code_id_activity_id_pk" PRIMARY KEY("activity_code_id","activity_id")
);
--> statement-breakpoint
CREATE TABLE "activity_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"code" varchar(255) NOT NULL,
	"private_code" varchar(255) NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "activity_codes_private_code_unique" UNIQUE("private_code")
);
--> statement-breakpoint
CREATE TABLE "admin_permissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vid" integer DEFAULT 1 NOT NULL,
	"admin_role_id" uuid NOT NULL,
	"ability" varchar(128) NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_reports_mau" (
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "admin_reports_mau_year_month_pk" PRIMARY KEY("year","month")
);
--> statement-breakpoint
CREATE TABLE "admin_role_admin_user" (
	"admin_role_id" uuid NOT NULL,
	"admin_user_id" uuid NOT NULL,
	CONSTRAINT "admin_role_admin_user_admin_role_id_admin_user_id_pk" PRIMARY KEY("admin_role_id","admin_user_id")
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "agent_auth_codes" (
	"code" varchar PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" varchar NOT NULL,
	"redirect_uri" varchar NOT NULL,
	"code_challenge" varchar NOT NULL,
	"expires_at" timestamp (0) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_refresh_tokens" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp (6) with time zone NOT NULL,
	"used_at" timestamp (6) with time zone
);
--> statement-breakpoint
CREATE TABLE "email_change_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"email" varchar(254) NOT NULL,
	"verification_code" varchar(50) NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollment" (
	"activity_code_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "enrollment_activity_code_id_activity_id_user_id_pk" PRIMARY KEY("activity_code_id","activity_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "lti_launches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"launch" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lti_lineitems" (
	"user_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"lineitem_url" varchar NOT NULL,
	"submitted_progress" real NOT NULL,
	"platform_issuer" varchar NOT NULL,
	"lti_user_id" varchar(255) NOT NULL,
	CONSTRAINT "lti_lineitems_user_id_activity_id_lineitem_url_pk" PRIMARY KEY("user_id","activity_id","lineitem_url")
);
--> statement-breakpoint
CREATE TABLE "lti_nonces" (
	"nonce" varchar(40) PRIMARY KEY NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lti_platforms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"issuer" varchar NOT NULL,
	"name" varchar NOT NULL,
	"client_id" varchar NOT NULL,
	"authorization_endpoint" varchar NOT NULL,
	"token_endpoint" varchar NOT NULL,
	"jwks_uri" varchar NOT NULL,
	"authorization_server" varchar NOT NULL,
	"deployment_id" varchar,
	CONSTRAINT "lti_platforms_issuer_unique" UNIQUE("issuer")
);
--> statement-breakpoint
CREATE TABLE "page_state" (
	"user_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"state" text DEFAULT '{}' NOT NULL,
	CONSTRAINT "page_state_user_id_activity_id_pk" PRIMARY KEY("user_id","activity_id")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vid" integer DEFAULT 1 NOT NULL,
	"role_id" uuid NOT NULL,
	"ability" varchar(128) NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress" (
	"activity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"progress" real NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_activity_id_user_id_pk" PRIMARY KEY("activity_id","user_id")
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "role_user" (
	"role_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "role_user_role_id_user_id_pk" PRIMARY KEY("role_id","user_id")
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "user_logins" (
	"time" timestamp with time zone NOT NULL,
	"user_id" uuid,
	"provider" text NOT NULL,
	"ip_address" "inet",
	"outcome" "user_login_outcome" NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "activity_activity_code" ADD CONSTRAINT "activity_activity_code_activity_code_id_activity_codes_id_fk" FOREIGN KEY ("activity_code_id") REFERENCES "public"."activity_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_activity_code" ADD CONSTRAINT "activity_activity_code_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_codes" ADD CONSTRAINT "activity_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_permissions" ADD CONSTRAINT "admin_permissions_admin_role_id_admin_roles_id_fk" FOREIGN KEY ("admin_role_id") REFERENCES "public"."admin_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_role_admin_user" ADD CONSTRAINT "admin_role_admin_user_admin_role_id_admin_roles_id_fk" FOREIGN KEY ("admin_role_id") REFERENCES "public"."admin_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_role_admin_user" ADD CONSTRAINT "admin_role_admin_user_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_auth_codes" ADD CONSTRAINT "agent_auth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_refresh_tokens" ADD CONSTRAINT "agent_refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_activity_code_id_activity_codes_id_fk" FOREIGN KEY ("activity_code_id") REFERENCES "public"."activity_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD CONSTRAINT "lti_lineitems_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD CONSTRAINT "lti_lineitems_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD CONSTRAINT "lti_lineitems_platform_issuer_lti_platforms_issuer_fk" FOREIGN KEY ("platform_issuer") REFERENCES "public"."lti_platforms"("issuer") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_state" ADD CONSTRAINT "page_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_state" ADD CONSTRAINT "page_state_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_user" ADD CONSTRAINT "role_user_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_user" ADD CONSTRAINT "role_user_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_id_idx" ON "email_change_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_code_idx" ON "email_change_requests" USING btree ("verification_code");--> statement-breakpoint
CREATE INDEX "user_logins_time_idx" ON "user_logins" USING btree ("time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_logins_outcome_idx" ON "user_logins" USING btree ("outcome","time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_logins_time_outcome_idx" ON "user_logins" USING btree ("time" DESC NULLS LAST,"outcome");--> statement-breakpoint
CREATE INDEX "full_name_idx" ON "users" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "github_id" ON "users" USING btree ("github_id");--> statement-breakpoint
CREATE INDEX "google_id" ON "users" USING btree ("google_id");