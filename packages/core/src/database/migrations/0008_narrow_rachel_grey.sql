CREATE TABLE "progress_events" (
	"submitted_at" timestamp (6) with time zone NOT NULL,
	"user_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"progress" real NOT NULL
);
--> statement-breakpoint
ALTER TABLE "progress_events" ADD CONSTRAINT "progress_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_events" ADD CONSTRAINT "progress_events_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "progress_events_activity_id_idx" ON "progress_events" USING btree ("activity_id","submitted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "progress_events_user_id_activity_id_idx" ON "progress_events" USING btree ("user_id","activity_id","submitted_at" DESC NULLS LAST);