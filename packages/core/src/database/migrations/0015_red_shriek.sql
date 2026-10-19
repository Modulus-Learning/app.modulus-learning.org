ALTER TABLE "enrollment" DROP CONSTRAINT "enrollment_activity_id_activities_id_fk";
--> statement-breakpoint
ALTER TABLE "enrollment" DROP CONSTRAINT "enrollment_activity_code_id_activity_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_activity_code_id_user_id_pk" PRIMARY KEY("activity_code_id","user_id");--> statement-breakpoint
ALTER TABLE "enrollment" ADD COLUMN "created_at" timestamp (6) with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "enrollment" DROP COLUMN "activity_id";