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
--> statement-breakpoint
DROP TABLE "lti_launches" CASCADE;--> statement-breakpoint
ALTER TABLE "pending_deep_links" ADD CONSTRAINT "pending_deep_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;