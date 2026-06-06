import { z } from "zod";
import { isAddress } from "viem";

export const repoFullNameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Use owner/repo format.");

export const walletAddressSchema = z
  .string()
  .trim()
  .refine((value) => isAddress(value), "Use a valid EVM wallet address.");

export const priceUsdcSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/, "Use a decimal USDC amount.")
  .refine((value) => {
    const amount = Number(value);
    return amount >= 0.01 && amount <= 1;
  }, "MVP prices must be between 0.01 and 1.00 USDC.");

export const trustedContributorSchema = z.object({
  walletAddress: walletAddressSchema.transform((value) => value.toLowerCase()),
  label: z.string().trim().max(80).optional().or(z.literal("")),
});

export const updateConfigSchema = z.object({
  repoFullName: repoFullNameSchema,
  priceUsdc: priceUsdcSchema,
  recipientAddress: walletAddressSchema,
  enabled: z.boolean().default(true),
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
