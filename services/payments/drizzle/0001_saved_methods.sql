CREATE TABLE "payment_customers" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"provider" varchar(10) NOT NULL,
	"provider_customer_id" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(10) NOT NULL,
	"provider_ref" varchar(80) NOT NULL,
	"brand" varchar(20) NOT NULL,
	"last4" varchar(4) NOT NULL,
	"exp_month" integer NOT NULL,
	"exp_year" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "payment_methods_user" ON "payment_methods" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_ref_key" ON "payment_methods" USING btree ("provider_ref");