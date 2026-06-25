ALTER TABLE "lti_lineitems" ALTER COLUMN "submitted_progress" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD COLUMN "dead_at" timestamp (6) with time zone;--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD COLUMN "submittable_progress" real NOT NULL;--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD COLUMN "submission_eligible_at" timestamp (6) with time zone;--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD COLUMN "submission_lease_expires_at" timestamp (6) with time zone;--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD COLUMN "submission_lease_token" uuid;--> statement-breakpoint
CREATE INDEX "lti_lineitems_eligible_idx" ON "lti_lineitems" USING btree ("platform_issuer","submission_eligible_at") WHERE "lti_lineitems"."dead_at" IS NULL AND "lti_lineitems"."submittable_progress" > "lti_lineitems"."submitted_progress";--> statement-breakpoint
ALTER TABLE "lti_lineitems" DROP COLUMN "submission_status";--> statement-breakpoint
ALTER TABLE "lti_lineitems" DROP COLUMN "submission_locked_until";