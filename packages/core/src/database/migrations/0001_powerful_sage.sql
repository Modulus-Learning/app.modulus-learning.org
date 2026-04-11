ALTER TABLE "lti_lineitems" DROP CONSTRAINT "lti_lineitems_user_id_activity_id_lineitem_url_pk";--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD COLUMN "id" uuid PRIMARY KEY NOT NULL;--> statement-breakpoint
CREATE INDEX "lti_lineitems_user_id_activity_id_idx" ON "lti_lineitems" USING btree ("user_id","activity_id");--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD CONSTRAINT "lti_lineitems_user_id_activity_id_lineitem_url_idx" UNIQUE("user_id","activity_id","lineitem_url");