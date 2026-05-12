CREATE TABLE "lti_platform_deployments" (
	"platform_issuer" varchar NOT NULL,
	"deployment_id" varchar NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lti_platform_deployments_platform_issuer_deployment_id_pk" PRIMARY KEY("platform_issuer","deployment_id")
);
--> statement-breakpoint
ALTER TABLE "lti_lineitems" DROP CONSTRAINT "lti_lineitems_platform_issuer_lti_platforms_issuer_fk";
--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD COLUMN "deployment_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "lti_platform_deployments" ADD CONSTRAINT "lti_platform_deployments_platform_issuer_lti_platforms_issuer_fk" FOREIGN KEY ("platform_issuer") REFERENCES "public"."lti_platforms"("issuer") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lti_lineitems" ADD CONSTRAINT "lti_lineitems_platform_issuer_deployment_id_fk" FOREIGN KEY ("platform_issuer","deployment_id") REFERENCES "public"."lti_platform_deployments"("platform_issuer","deployment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lti_platforms" DROP COLUMN "deployment_id";