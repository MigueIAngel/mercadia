CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"actor_id" uuid,
	"action" varchar(60) NOT NULL,
	"ip" varchar(64),
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"user_agent" text,
	"ip" varchar(64),
	"expires_at" timestamp with time zone NOT NULL,
	"rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"slug" varchar(90) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"city" varchar(80) DEFAULT '' NOT NULL,
	"logo_url" text,
	"accent_color" varchar(9) DEFAULT '#6366f1' NOT NULL,
	"status" varchar(12) DEFAULT 'active' NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"name" varchar(120) NOT NULL,
	"password_hash" text,
	"google_sub" varchar(64),
	"avatar_url" text,
	"locale" varchar(2) DEFAULT 'es' NOT NULL,
	"currency" varchar(3) DEFAULT 'COP' NOT NULL,
	"roles" text[] DEFAULT ARRAY['buyer']::text[] NOT NULL,
	"status" varchar(12) DEFAULT 'active' NOT NULL,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_user" ON "audit_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_key" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stores_slug_key" ON "stores" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "stores_owner_key" ON "stores" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_sub_key" ON "users" USING btree ("google_sub");