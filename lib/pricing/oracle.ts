import { ChainlinkProvider } from "./providers/chainlink";
import { CoinGeckoProvider } from "./providers/coingecko";
import { DexScreenerProvider } from "./providers/dexscreener";
import { ThirdwebProvider } from "./providers/thirdweb";
import {
  PriceUnavailableError,
  type AggregatedPrice,
  type PriceProvider,
  type PriceQuery,
  type ProviderError,
  type ProviderQuote,
} from "./types";

/** Per-provider request timeout. */
const PROVIDER_TIMEOUT_MS = 4_000;
/** How long a reconciled price is reused without re-fetching. */
const FRESH_TTL_MS = 30_000;
/** How long a reconciled price may be served as a stale fallback. */
const STALE_TTL_MS = 10 * 60_000;
/** Max relative distance from the median a quote may be and still be used. */
const MAX_DEVIATION = 0.1;

interface CacheEntry {
  result: AggregatedPrice;
  at: number;
}

const cache = new Map<string, CacheEntry>();

// Order matters only for logging; all providers run in parallel. Chainlink is
// listed first as the most manipulation-resistant anchor.
const providers: PriceProvider[] = [
  new ChainlinkProvider(),
  new CoinGeckoProvider(),
  new DexScreenerProvider(),
  new ThirdwebProvider(),
];

export interface GetPriceOptions {
  /** Bypass the fresh cache and force a new fetch. */
  forceRefresh?: boolean;
}

function cacheKey(query: PriceQuery): string {
  return `${query.chainId}:${query.tokenAddress.toLowerCase()}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

async function withTimeout(
  provider: PriceProvider,
  query: PriceQuery,
): Promise<ProviderQuote | ProviderError> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const usd = await provider.fetchPrice(query, controller.signal);
    if (usd === null) {
      return { source: provider.name, error: "no data" };
    }
    if (!Number.isFinite(usd) || usd <= 0) {
      return { source: provider.name, error: "invalid price" };
    }
    return { source: provider.name, usd, at: Date.now() };
  } catch (error) {
    const message =
      controller.signal.aborted
        ? "timeout"
        : error instanceof Error
          ? error.message
          : "unknown error";
    return { source: provider.name, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reconcile quotes into a single USD price.
 *
 * Strategy: anchor on the median (robust to a single bad source), then drop any
 * quote more than MAX_DEVIATION away from it, and take the median of what
 * remains. With a single source we accept it but the caller can see only one
 * quote backed the result.
 */
function reconcile(quotes: ProviderQuote[]): {
  usd: number;
  used: ProviderQuote[];
} {
  if (quotes.length === 1) {
    return { usd: quotes[0].usd, used: quotes };
  }

  const anchor = median(quotes.map((q) => q.usd));
  const used = quotes.filter(
    (q) => Math.abs(q.usd - anchor) / anchor <= MAX_DEVIATION,
  );
  const kept = used.length > 0 ? used : quotes;
  return { usd: median(kept.map((q) => q.usd)), used: kept };
}

/**
 * Returns a reconciled USD price for one whole unit of the token, querying all
 * configured providers in parallel and surviving the failure of any subset.
 *
 * Throws {@link PriceUnavailableError} only when every provider fails and no
 * usable cached value exists.
 */
export async function getTokenUsdPrice(
  query: PriceQuery,
  options: GetPriceOptions = {},
): Promise<AggregatedPrice> {
  const key = cacheKey(query);
  const cached = cache.get(key);

  if (!options.forceRefresh && cached && Date.now() - cached.at < FRESH_TTL_MS) {
    return { ...cached.result, cached: true };
  }

  const active = providers.filter((provider) => provider.isConfigured());
  const settled = await Promise.all(
    active.map((provider) => withTimeout(provider, query)),
  );

  const quotes: ProviderQuote[] = [];
  const errors: ProviderError[] = [];
  for (const item of settled) {
    if ("usd" in item) {
      quotes.push(item);
    } else {
      errors.push(item);
    }
  }

  if (quotes.length === 0) {
    if (cached && Date.now() - cached.at < STALE_TTL_MS) {
      return { ...cached.result, cached: true, stale: true };
    }
    throw new PriceUnavailableError(query.tokenAddress, errors);
  }

  const { usd, used } = reconcile(quotes);
  const result: AggregatedPrice = {
    usd,
    used,
    quotes,
    errors,
    cached: false,
    stale: false,
  };

  cache.set(key, { result, at: Date.now() });
  return result;
}
