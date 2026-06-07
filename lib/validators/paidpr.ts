import { z } from "zod";
import { getAddress, isAddress } from "viem";

export const repoFullNameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Use owner/repo format.");

export const walletAddressSchema = z
  .string()
  .trim()
  .refine((value) => isAddress(value), "Use a valid EVM wallet address.");

/** A positive decimal amount (USD or token units) with up to 18 places. */
export const priceAmountSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,18})?$/, "Use a positive decimal amount.")
  .refine((value) => {
    const amount = Number(value);
    return amount > 0 && amount <= 1_000_000_000;
  }, "Amount must be greater than 0.");

export const priceModeSchema = z.enum(["usd", "token"]);
export const assetTransferMethodSchema = z.enum(["eip3009", "permit2"]);

const tokenAddressSchema = z
  .string()
  .trim()
  .refine((value) => isAddress(value), "Use a valid token contract address.")
  .transform((value) => getAddress(value));

const optionalTokenAddressSchema = z
  .string()
  .trim()
  .optional()
  .refine(
    (value) => !value || isAddress(value),
    "Use a valid token contract address.",
  )
  .transform((value) => (value ? getAddress(value) : undefined));

export const trustedContributorSchema = z.object({
  walletAddress: walletAddressSchema.transform((value) => value.toLowerCase()),
  label: z.string().trim().max(80).optional().or(z.literal("")),
});

export const updateConfigSchema = z.object({
  repoFullName: repoFullNameSchema,
  recipientAddress: walletAddressSchema,
  enabled: z.boolean().default(true),
  priceMode: priceModeSchema.default("token"),
  priceAmount: priceAmountSchema,
  // The payment token. The server re-resolves symbol/decimals/EIP-712 domain
  // on-chain, so callers only need to supply the address (and optionally the
  // transfer method and a Chainlink feed override).
  paymentTokenAddress: tokenAddressSchema,
  assetTransferMethod: assetTransferMethodSchema.default("eip3009"),
  chainlinkFeed: optionalTokenAddressSchema,
  trustedContributors: z.array(trustedContributorSchema).default([]),
});

export const createPrSchema = z.object({
  repoFullName: repoFullNameSchema,
  title: z.string().trim().min(1).max(256),
  body: z.string().trim().max(65_000).optional().default(""),
  head: z.string().trim().min(1),
  base: z.string().trim().min(1).default("main"),
  labels: z.array(z.string().trim().min(1).max(100)).optional().default([]),
  draft: z.boolean().optional().default(false),
  maintainerCanModify: z.boolean().optional().default(true),
  payerAddress: walletAddressSchema.optional(),
});

export type UpdateConfigInput = z.infer<typeof updateConfigSchema>;
export type CreatePrInput = z.infer<typeof createPrSchema>;
