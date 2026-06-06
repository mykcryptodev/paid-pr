CREATE TABLE "github_installations" (
	"id" serial PRIMARY KEY NOT NULL,
	"installation_id" integer NOT NULL,
	"account_login" text NOT NULL,
	"account_id" integer NOT NULL,
	"account_type" text NOT NULL,
	"sender_github_id" integer,
	"sender_login" text,
	"repositories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_installations_installation_id_unique" UNIQUE("installation_id")
);
--> statement-breakpoint
CREATE TABLE "payment_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"tx_hash" text,
	"payment_id" text,
	"repo_full_name" text NOT NULL,
	"head_ref" text,
	"base_ref" text,
	"pr_number" integer,
	"payer_address" text,
	"amount_usdc" numeric(10, 6) NOT NULL,
	"receipt_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"github_installation_id" integer NOT NULL,
	"repo_full_name" text NOT NULL,
	"price_usdc" numeric(10, 6) DEFAULT '0.05' NOT NULL,
	"recipient_address" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trusted_contributors" (
	"id" serial PRIMARY KEY NOT NULL,
	"repo_config_id" integer NOT NULL,
	"wallet_address" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repo_configs" ADD CONSTRAINT "repo_configs_github_installation_id_github_installations_installation_id_fk" FOREIGN KEY ("github_installation_id") REFERENCES "public"."github_installations"("installation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_contributors" ADD CONSTRAINT "trusted_contributors_repo_config_id_repo_configs_id_fk" FOREIGN KEY ("repo_config_id") REFERENCES "public"."repo_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "github_installations_account_idx" ON "github_installations" USING btree ("account_login");--> statement-breakpoint
CREATE INDEX "payment_receipts_repo_idx" ON "payment_receipts" USING btree ("repo_full_name");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_receipts_tx_hash_idx" ON "payment_receipts" USING btree ("tx_hash") WHERE "payment_receipts"."tx_hash" is not null;--> statement-breakpoint
CREATE INDEX "payment_receipts_repo_pr_idx" ON "payment_receipts" USING btree ("repo_full_name","pr_number");--> statement-breakpoint
CREATE UNIQUE INDEX "repo_configs_repo_full_name_idx" ON "repo_configs" USING btree ("repo_full_name");--> statement-breakpoint
CREATE INDEX "repo_configs_installation_idx" ON "repo_configs" USING btree ("github_installation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trusted_contributors_repo_wallet_idx" ON "trusted_contributors" USING btree ("repo_config_id","wallet_address");