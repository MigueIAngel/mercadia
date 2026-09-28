CREATE TABLE "connected_accounts" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"provider" varchar(10) NOT NULL,
	"provider_account_id" varchar(80),
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"provider" varchar(10) NOT NULL,
	"provider_ref" varchar(80),
	"amount" integer NOT NULL,
	"refunded" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar(20) DEFAULT 'requires_payment' NOT NULL,
	"failure_reason" text,
	"card_brand" varchar(20),
	"card_last4" varchar(4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"seller_order_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"reason" varchar(60) NOT NULL,
	"provider_ref" varchar(80),
	"source_id" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_source_id_unique" UNIQUE("source_id")
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"seller_order_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"store_name" varchar(80) NOT NULL,
	"gross" integer NOT NULL,
	"commission" integer NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar(12) DEFAULT 'held' NOT NULL,
	"provider_ref" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" varchar(80) PRIMARY KEY NOT NULL,
	"type" varchar(60) NOT NULL,
	"payload" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_order_key" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_ref" ON "payments" USING btree ("provider_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "transfers_seller_order_key" ON "transfers" USING btree ("seller_order_id");--> statement-breakpoint
CREATE INDEX "transfers_store" ON "transfers" USING btree ("store_id","created_at");