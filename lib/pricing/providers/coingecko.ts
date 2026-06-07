import { env } from "@/lib/env";
import { BASE_MAINNET_CHAIN_ID } from "@/lib/chain/client";
import type { PriceProvider, PriceQuery } from "../types";

/**
 * CoinGecko on-chain token price by contract address.
 *
 * Works keyless (heavily rate limited), with a demo key, or with a pro key.
 * Only Base mainnet is mapped to a CoinGecko asset platform; other chains
 * resolve to `null`.
 */
export class CoinGeckoProvider implements PriceProvider {
  readonly name = "coingecko";

  isConfigured(): boolean {
    return true; // keyless fallback is allowed
  }

  async fetchPrice(query: PriceQuery, signal: AbortSignal): Promise<number | null> {
    if (query.chainId !== BASE_MAINNET_CHAIN_ID) {
      return null;
    }

    const address = query.tokenAddress.toLowerCase();
    const usePro = Boolean(env.coingeckoProApiKey);
    const baseUrl = usePro
      ? "https://pro-api.coingecko.com/api/v3"
      : "https://api.coingecko.com/api/v3";

    const url = new URL(`${baseUrl}/simple/token_price/base`);
    url.searchParams.set("contract_addresses", address);
    url.searchParams.set("vs_currencies", "usd");

    const headers: Record<string, string> = { accept: "application/json" };
    if (usePro) {
      headers["x-cg-pro-api-key"] = env.coingeckoProApiKey as string;
    } else if (env.coingeckoApiKey) {
      headers["x-cg-demo-api-key"] = env.coingeckoApiKey;
    }

    const response = await fetch(url, { headers, signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as Record<
      string,
      { usd?: number } | undefined
    >;
    const usd = data?.[address]?.usd;
    return typeof usd === "number" && usd > 0 ? usd : null;
  }
}
