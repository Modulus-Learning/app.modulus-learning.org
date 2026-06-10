CREATE TABLE "lti_platform_health" (
	"platform_issuer" varchar PRIMARY KEY NOT NULL,
	"status" varchar DEFAULT 'healthy' NOT NULL,
	"paused_until" timestamp (6) with time zone,
	"last_success_at" timestamp (6) with time zone,
	"last_failure_at" timestamp (6) with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lti_submission_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"platform_issuer" varchar NOT NULL,
	"deployment_id" varchar,
	"lineitem_id" uuid,
	"occurred_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"outcome" varchar NOT NULL,
	"category" varchar,
	"http_status" integer,
	"detail" text
);
--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD COLUMN "submission_status" varchar DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD COLUMN "submission_locked_until" timestamp (6) with time zone;--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD COLUMN "submission_error_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD COLUMN "submission_error_category" text;--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD COLUMN "submission_error_message" text;--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD COLUMN "created_at" timestamp (6) with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD COLUMN "updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "lti_platform_health" ADD CONSTRAINT "lti_platform_health_platform_issuer_lti_platforms_issuer_fk" FOREIGN KEY ("platform_issuer") REFERENCES "public"."lti_platforms"("issuer") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lti_submission_events" ADD CONSTRAINT "lti_submission_events_platform_issuer_lti_platforms_issuer_fk" FOREIGN KEY ("platform_issuer") REFERENCES "public"."lti_platforms"("issuer") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lti_submission_events_issuer_time_idx" ON "lti_submission_events" USING btree ("platform_issuer","occurred_at");--> statement-breakpoint
ALTER TABLE "lti_lineitems" DROP COLUMN "submission_locked_at";--> statement-breakpoint
ALTER TABLE "lti_lineitems" DROP COLUMN "submission_attempts";--> statement-breakpoint
ALTER TABLE "lti_lineitems" DROP COLUMN "submission_next_retry_at";--> statement-breakpoint
ALTER TABLE "lti_lineitems" DROP COLUMN "submission_last_error";