CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" varchar(40) DEFAULT 'Casa' NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"line1" varchar(160) NOT NULL,
	"line2" varchar(160),
	"city" varchar(80) NOT NULL,
	"department" varchar(80) NOT NULL,
	"postal_code" varchar(12),
	"country" varchar(2) DEFAULT 'CO' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispute_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"dispute_id" uuid NOT NULL,
	"author_id" uuid,
	"author_role" varchar(10) NOT NULL,
	"text" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"seller_order_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"reason" varchar(20) NOT NULL,
	"description" text NOT NULL,
	"requested_amount" integer NOT NULL,
	"max_amount" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"resolution" varchar(20),
	"refund_amount" integer,
	"seller_deadline" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "outbox_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "seller_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"status" varchar(20) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_order_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"carrier" varchar(40) NOT NULL,
	"service" varchar(12) DEFAULT 'standard' NOT NULL,
	"tracking_number" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'label_created' NOT NULL,
	"origin" varchar(80) NOT NULL,
	"destination" jsonb NOT NULL,
	"estimated_delivery" timestamp with time zone NOT NULL,
	"next_step_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"shipment_id" uuid NOT NULL,
	"status" varchar(20) NOT NULL,
	"location" varchar(80) NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dispute_messages" ADD CONSTRAINT "dispute_messages_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addresses_user" ON "addresses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "disputes_buyer" ON "disputes" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "disputes_store" ON "disputes" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "disputes_status" ON "disputes" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_seller_order_key" ON "shipments" USING btree ("seller_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_tracking_key" ON "shipments" USING btree ("tracking_number");--> statement-breakpoint
CREATE INDEX "shipments_next_step" ON "shipments" USING btree ("next_step_at");