import { formatUnits, parseUnits } from "viem";
import { chainIdFromNetwork } from "@/lib/chain/client";
import { env } from "@/lib/env";
import { getTokenUsdPrice, type AggregatedPrice } from "@/lib/pricing";
import type { RepoConfig } from "@/lib/db/schema";

/** The x402 AssetAmount price shape consumed by `withX402` accepts.price. */
export interface AssetPrice {
  asset: string;
  amount: string;
  extra: Record<string, unknown>;
}

export interface ComputedPayment {
  /** x402 price object for this payment. */
  price: AssetPrice;
  network: `${string}:${string}`;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  /** Settled amount in atomic token units (string of an integer). */
  amountAtomic: string;
  /** Settled amount in whole token units, human readable. */
  amountDisplay: string;
  /** Oracle USD price per whole token, when available. */
  usdPrice: number | null;
  /** USD value of the payment, when a price was available. */
  amountUsd: number | null;
  /** Diagnostics about which providers contributed the price. */
  priceSources: PriceSources | null;
}

export interface PriceSources {
  usd: number;
  used: { source: string; usd: number }[];
  quotes: { source: string; usd: number }[];
  errors: { source: string; error: string }[];
  cached: boolean;
  stale: boolean;
}

/** Drop fractional digits a token cannot represent, so parseUnits won't throw. */
function truncateToDecimals(value: string, decimals: number): string {
  const [whole, fraction = ""] = value.split(".");
  if (decimals === 0) {
    return whole;
  }
  const trimmed = fraction.slice(0, decimals);
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function summarizeSources(price: AggregatedPrice): PriceSources {
  return {
    usd: price.usd,
    used: price.used.map((q) => ({ source: q.source, usd: q.usd })),
    quotes: price.quotes.map((q) => ({ source: q.source, usd: q.usd })),
    errors: price.errors,
    cached: price.cached,
    stale: price.stale,
  };
}

/**
 * Convert a USD amount into atomic token units using the oracle price.
 *
 * Math is done in fixed-point integers (18 decimal places) to avoid floating
 * point drift, then divided into the token's atomic precision with round-half-up.
 */
function usdToAtomic(
  usdAmount: string,
  usdPricePerToken: number,
  decimals: number,
): bigint {
  const usd = parseUnits(usdAmount, 18);
  const price = parseUnits(usdPricePerToken.toFixed(18), 18);
  if (price === BigInt(0)) {
    throw new Error("Token USD price resolved to zero");
  }
  // tokens = usd / price; atomic = tokens * 10^decimals
  //        = (usd * 10^18 * 10^decimals) / (price * 10^18)  [scales cancel]
  const numerator = usd * BigInt(10) ** BigInt(decimals);
  // round half up
  return (numerator + price / BigInt(2)) / price;
}

/**
 * Resolve the on-chain payment for a repo config: the exact token, the atomic
 * amount to charge, and the x402 price object to hand to the facilitator.
 *
 * In "token" mode the amount is fixed and no oracle call is required (a USD
 * estimate is still attached on a best-effort basis). In "usd" mode the oracle
 * converts the configured USD price into token units at request time.
 */
export async function computePayment(
  config: Pick<
    RepoConfig,
    | "priceMode"
    | "priceAmount"
    | "paymentTokenAddress"
    | "paymentTokenSymbol"
    | "paymentTokenDecimals"
    | "paymentTokenName"
    | "paymentTokenVersion"
    | "assetTransferMethod"
    | "chainlinkFeed"
  >,
): Promise<ComputedPayment> {
  const network = env.x402Network as `${string}:${string}`;
  const chainId = chainIdFromNetwork(network);
  const decimals = config.paymentTokenDecimals;

  const extra: Record<string, unknown> =
    config.assetTransferMethod === "permit2"
      ? { assetTransferMethod: "permit2" }
      : { name: config.paymentTokenName, version: config.paymentTokenVersion };

  let amountAtomic: bigint;
  let usdPrice: number | null = null;
  let amountUsd: number | null = null;
  let priceSources: PriceSources | null = null;

  if (config.priceMode === "token") {
    amountAtomic = parseUnits(truncateToDecimals(config.priceAmount, decimals), decimals);
    // Best-effort USD estimate; never blocks a fixed-token-amount payment.
    try {
      const price = await getTokenUsdPrice({
        tokenAddress: config.paymentTokenAddress,
        chainId,
        symbol: config.paymentTokenSymbol,
        chainlinkFeed: config.chainlinkFeed ?? undefined,
      });
      usdPrice = price.usd;
      amountUsd = Number(config.priceAmount) * price.usd;
      priceSources = summarizeSources(price);
    } catch {
      // Leave USD fields null.
    }
  } else {
    const price = await getTokenUsdPrice({
      tokenAddress: config.paymentTokenAddress,
      chainId,
      symbol: config.paymentTokenSymbol,
      chainlinkFeed: config.chainlinkFeed ?? undefined,
    });
    usdPrice = price.usd;
    priceSources = summarizeSources(price);
    amountAtomic = usdToAtomic(config.priceAmount, price.usd, decimals);
    amountUsd = Number(config.priceAmount);
  }

  return {
    price: {
      asset: config.paymentTokenAddress,
      amount: amountAtomic.toString(),
      extra,
    },
    network,
    tokenAddress: config.paymentTokenAddress,
    tokenSymbol: config.paymentTokenSymbol,
    tokenDecimals: decimals,
    amountAtomic: amountAtomic.toString(),
    amountDisplay: formatUnits(amountAtomic, decimals),
    usdPrice,
    amountUsd,
    priceSources,
  };
}
