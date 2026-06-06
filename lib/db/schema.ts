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
    priceUsdc: numeric("price_usdc", { precision: 10, scale: 6 })
      .notNull()
      .default("0.05"),
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
    amountUsdc: numeric("amount_usdc", { precision: 10, scale: 6 }).notNull(),
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
