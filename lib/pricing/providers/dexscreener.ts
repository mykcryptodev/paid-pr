import { BASE_MAINNET_CHAIN_ID } from "@/lib/chain/client";
import type { PriceProvider, PriceQuery } from "../types";

interface DexScreenerPair {
  chainId?: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
}

const DEXSCREENER_CHAIN: Record<number, string> = {
  [BASE_MAINNET_CHAIN_ID]: "base",
};

/**
 * DexScreener aggregates DEX pools across chains and needs no API key.
 *
 * A token can trade in many pools at slightly different prices, so we take a
 * liquidity-weighted average across the token's Base pairs. Pools with no
 * reported liquidity are ignored to avoid being moved by dust pairs.
 */
export class DexScreenerProvider implements PriceProvider {
  readonly name = "dexscreener";

  isConfigured(): boolean {
    return true;
  }

  async fetchPrice(query: PriceQuery, signal: AbortSignal): Promise<number | null> {
    const chain = DEXSCREENER_CHAIN[query.chainId];
    if (!chain) {
      return null;
    }

    const url = `https://api.dexscreener.com/latest/dex/tokens/${query.tokenAddress}`;
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as { pairs?: DexScreenerPair[] };
    const pairs = (data.pairs ?? []).filter(
      (pair) =>
        pair.chainId === chain &&
        typeof pair.priceUsd === "string" &&
        Number(pair.priceUsd) > 0,
    );

    if (pairs.length === 0) {
      return null;
    }

    let weightedSum = 0;
    let weightTotal = 0;
    for (const pair of pairs) {
      const price = Number(pair.priceUsd);
      const liquidity = pair.liquidity?.usd ?? 0;
      if (liquidity > 0) {
        weightedSum += price * liquidity;
        weightTotal += liquidity;
      }
    }

    if (weightTotal > 0) {
      return weightedSum / weightTotal;
    }

    // No liquidity data anywhere: fall back to the median raw price.
    const prices = pairs.map((pair) => Number(pair.priceUsd)).sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    return prices.length % 2 === 0
      ? (prices[mid - 1] + prices[mid]) / 2
      : prices[mid];
  }
}
