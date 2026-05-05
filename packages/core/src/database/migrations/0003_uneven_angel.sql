ALTER TABLE "activity_codes" ADD COLUMN "url_prefix" varchar(255);--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD COLUMN "submitted_at" timestamp (6) with time zone;--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD COLUMN "submission_locked_at" timestamp (6) with time zone;--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD COLUMN "submission_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD COLUMN "submission_next_retry_at" timestamp (6) with time zone;--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD COLUMN "submission_last_error" text;