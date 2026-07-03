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
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "lti_submission_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "lti_submission_events" CASCADE;--> statement-breakpoint
ALTER TABLE "lti_platform_health" ADD COLUMN "open_incident_id" uuid;--> statement-breakpoint
ALTER TABLE "lti_platform_incidents" ADD CONSTRAINT "lti_platform_incidents_platform_issuer_lti_platforms_issuer_fk" FOREIGN KEY ("platform_issuer") REFERENCES "public"."lti_platforms"("issuer") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lti_submission_failures" ADD CONSTRAINT "lti_submission_failures_platform_issuer_lti_platforms_issuer_fk" FOREIGN KEY ("platform_issuer") REFERENCES "public"."lti_platforms"("issuer") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lti_submission_failures" ADD CONSTRAINT "lti_submission_failures_incident_id_lti_platform_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."lti_platform_incidents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lti_platform_incidents_one_open_idx" ON "lti_platform_incidents" USING btree ("platform_issuer") WHERE "lti_platform_incidents"."resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX "lti_platform_incidents_unnotified_idx" ON "lti_platform_incidents" USING btree ("opened_at") WHERE "lti_platform_incidents"."resolved_at" IS NULL AND "lti_platform_incidents"."notified_at" IS NULL;--> statement-breakpoint
CREATE INDEX "lti_platform_incidents_allclear_idx" ON "lti_platform_incidents" USING btree ("resolved_at") WHERE "lti_platform_incidents"."notified_at" IS NOT NULL AND "lti_platform_incidents"."resolved_notified_at" IS NULL;--> statement-breakpoint
CREATE INDEX "lti_platform_incidents_issuer_time_idx" ON "lti_platform_incidents" USING btree ("platform_issuer","opened_at");--> statement-breakpoint
CREATE INDEX "lti_submission_failures_issuer_time_idx" ON "lti_submission_failures" USING btree ("platform_issuer","occurred_at");--> statement-breakpoint
CREATE INDEX "lti_submission_failures_incident_idx" ON "lti_submission_failures" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "lti_submission_failures_isolated_idx" ON "lti_submission_failures" USING btree ("platform_issuer","category","occurred_at") WHERE "lti_submission_failures"."incident_id" IS NULL;--> statement-breakpoint
ALTER TABLE "lti_platform_health" ADD CONSTRAINT "lti_platform_health_open_incident_id_lti_platform_incidents_id_fk" FOREIGN KEY ("open_incident_id") REFERENCES "public"."lti_platform_incidents"("id") ON DELETE set null ON UPDATE no action;