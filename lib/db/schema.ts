import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const githubInstallations = pgTable(
  "github_installations",
  {
    id: serial("id").primaryKey(),
    installationId: integer("installation_id").notNull().unique(),
    accountLogin: text("account_login").notNull(),
    accountId: integer("account_id").notNull(),
    accountType: text("account_type").notNull(),
    senderGithubId: integer("sender_github_id"),
    senderLogin: text("sender_login"),
    repositories: jsonb("repositories").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    accountIdx: index("github_installations_account_idx").on(table.accountLogin),
  }),
);

// Default payment token: native USDC on Base mainnet. Matches the x402
// default asset so existing USDC-priced repos behave identically.
export const DEFAULT_TOKEN_ADDRESS =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const DEFAULT_TOKEN_SYMBOL = "USDC";
export const DEFAULT_TOKEN_DECIMALS = 6;
export const DEFAULT_TOKEN_EIP712_NAME = "USD Coin";
export const DEFAULT_TOKEN_EIP712_VERSION = "2";

export const repoConfigs = pgTable(
  "repo_configs",
  {
    id: serial("id").primaryKey(),
    githubInstallationId: integer("github_installation_id")
      .notNull()
      .references(() => githubInstallations.installationId, {
        onDelete: "cascade",
      }),
    repoFullName: text("repo_full_name").notNull(),
    // Pricing: maintainers either fix a USD price (converted to token units at
    // payment time via the price oracle) or a fixed token amount. Defaults to a
    // fixed token amount (0.05 USDC); USD mode lives under advanced settings.
    priceMode: text("price_mode").notNull().default("token"), // "usd" | "token"
    priceAmount: numeric("price_amount", { precision: 38, scale: 18 })
      .notNull()
      .default("0.05"),
    // Payment token (ERC-20 on the configured network).
    paymentTokenAddress: text("payment_token_address")
      .notNull()
      .default(DEFAULT_TOKEN_ADDRESS),
    paymentTokenSymbol: text("payment_token_symbol")
      .notNull()
      .default(DEFAULT_TOKEN_SYMBOL),
    paymentTokenDecimals: integer("payment_token_decimals")
      .notNull()
      .default(DEFAULT_TOKEN_DECIMALS),
    // EIP-712 domain for transferWithAuthorization (EIP-3009) signing.
    paymentTokenName: text("payment_token_name")
      .notNull()
      .default(DEFAULT_TOKEN_EIP712_NAME),
    paymentTokenVersion: text("payment_token_version")
      .notNull()
      .default(DEFAULT_TOKEN_EIP712_VERSION),
    // How the facilitator moves the token: "eip3009" (default) or "permit2".
    assetTransferMethod: text("asset_transfer_method")
      .notNull()
      .default("eip3009"),
    // Optional Chainlink USD aggregator override for the price oracle.
    chainlinkFeed: text("chainlink_feed"),
    recipientAddress: text("recipient_address").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    repoIdx: uniqueIndex("repo_configs_repo_full_name_idx").on(
      table.repoFullName,
    ),
    installationIdx: index("repo_configs_installation_idx").on(
      table.githubInstallationId,
    ),
  }),
);

export const trustedContributors = pgTable(
  "trusted_contributors",
  {
    id: serial("id").primaryKey(),
    repoConfigId: integer("repo_config_id")
      .notNull()
      .references(() => repoConfigs.id, { onDelete: "cascade" }),
    walletAddress: text("wallet_address").notNull(),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    walletIdx: uniqueIndex("trusted_contributors_repo_wallet_idx").on(
      table.repoConfigId,
      table.walletAddress,
    ),
  }),
);

export const paymentReceipts = pgTable(
  "payment_receipts",
  {
    id: serial("id").primaryKey(),
    txHash: text("tx_hash"),
    paymentId: text("payment_id"),
    repoFullName: text("repo_full_name").notNull(),
    headRef: text("head_ref"),
    baseRef: text("base_ref"),
    prNumber: integer("pr_number"),
    payerAddress: text("payer_address"),
    // Payment token and the settled amount, in both atomic and human units.
    tokenAddress: text("token_address"),
    tokenSymbol: text("token_symbol"),
    tokenDecimals: integer("token_decimals"),
    amountAtomic: text("amount_atomic").notNull(),
    amountToken: numeric("amount_token", { precision: 38, scale: 18 }),
    // USD value at payment time and the oracle price used to derive it.
    amountUsd: numeric("amount_usd", { precision: 38, scale: 18 }),
    priceUsd: numeric("price_usd", { precision: 38, scale: 18 }),
    priceSources: jsonb("price_sources").$type<Record<string, unknown>>(),
    receiptPayload: jsonb("receipt_payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    repoIdx: index("payment_receipts_repo_idx").on(table.repoFullName),
    txIdx: uniqueIndex("payment_receipts_tx_hash_idx")
      .on(table.txHash)
      .where(sql`${table.txHash} is not null`),
    prIdx: index("payment_receipts_repo_pr_idx").on(
      table.repoFullName,
      table.prNumber,
    ),
  }),
);

export const githubInstallationsRelations = relations(
  githubInstallations,
  ({ many }) => ({
    repoConfigs: many(repoConfigs),
  }),
);

export const repoConfigsRelations = relations(repoConfigs, ({ many, one }) => ({
  installation: one(githubInstallations, {
    fields: [repoConfigs.githubInstallationId],
    references: [githubInstallations.installationId],
  }),
  trustedContributors: many(trustedContributors),
}));

export const trustedContributorsRelations = relations(
  trustedContributors,
  ({ one }) => ({
    repoConfig: one(repoConfigs, {
      fields: [trustedContributors.repoConfigId],
      references: [repoConfigs.id],
    }),
  }),
);

export type GithubInstallation = typeof githubInstallations.$inferSelect;
export type NewGithubInstallation = typeof githubInstallations.$inferInsert;
export type RepoConfig = typeof repoConfigs.$inferSelect;
export type NewRepoConfig = typeof repoConfigs.$inferInsert;
export type TrustedContributor = typeof trustedContributors.$inferSelect;
export type PaymentReceipt = typeof paymentReceipts.$inferSelect;
