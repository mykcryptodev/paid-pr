import { env } from "@/lib/env";
import type { PriceProvider, PriceQuery } from "../types";

/**
 * Thirdweb token API (https://api.thirdweb.com/v1/tokens).
 *
 * Authenticated with a server secret key when available, otherwise a public
 * client id. The response shape has shifted across API versions, so we search
 * the returned token records defensively for a USD price field rather than
 * binding to one exact path.
 */
export class ThirdwebProvider implements PriceProvider {
  readonly name = "thirdweb";

  isConfigured(): boolean {
    return Boolean(env.thirdwebSecretKey || env.thirdwebClientId);
  }

  async fetchPrice(query: PriceQuery, signal: AbortSignal): Promise<number | null> {
    const url = new URL("https://api.thirdweb.com/v1/tokens");
    url.searchParams.set("chainId", String(query.chainId));
    url.searchParams.set("tokenAddress", query.tokenAddress);

    const headers: Record<string, string> = { accept: "application/json" };
    if (env.thirdwebSecretKey) {
      headers["x-secret-key"] = env.thirdwebSecretKey;
    } else if (env.thirdwebClientId) {
      headers["x-client-id"] = env.thirdwebClientId;
    }

    const response = await fetch(url, { headers, signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data: unknown = await response.json();
    const token = findTokenRecord(data, query.tokenAddress.toLowerCase());
    const usd = token ? extractUsdPrice(token) : null;
    return typeof usd === "number" && usd > 0 ? usd : null;
  }
}

/** Locate the token object matching `address` anywhere in the response tree. */
function findTokenRecord(
  node: unknown,
  address: string,
): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findTokenRecord(item, address);
      if (found) return found;
    }
    return null;
  }

  if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    const recordAddress =
      typeof record.address === "string"
        ? record.address.toLowerCase()
        : typeof record.tokenAddress === "string"
          ? record.tokenAddress.toLowerCase()
          : null;
    if (recordAddress === address && extractUsdPrice(record) !== null) {
      return record;
    }
    for (const value of Object.values(record)) {
      const found = findTokenRecord(value, address);
      if (found) return found;
    }
  }

  return null;
}

/** Pull a USD price out of a token record across known field spellings. */
function extractUsdPrice(record: Record<string, unknown>): number | null {
  const direct =
    record.priceUsd ?? record.price_usd ?? record.usdPrice ?? record.priceUSD;
  if (typeof direct === "number" && direct > 0) return direct;
  if (typeof direct === "string" && Number(direct) > 0) return Number(direct);

  const prices = record.prices;
  if (prices && typeof prices === "object") {
    const map = prices as Record<string, unknown>;
    const usd = map.usd ?? map.USD;
    if (typeof usd === "number" && usd > 0) return usd;
    if (typeof usd === "string" && Number(usd) > 0) return Number(usd);
  }

  return null;
}
