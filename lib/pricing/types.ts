/**
 * Shared types for the multi-source USD price oracle.
 *
 * The oracle answers a single question: "what is one whole unit of this ERC-20
 * token worth in USD right now?" It does so by querying several independent
 * providers and reconciling their answers so that a single bad or stale source
 * cannot move the price we charge.
 */

export type ChainId = number;

export interface PriceQuery {
  /** ERC-20 contract address (checksummed or lowercase). */
  tokenAddress: string;
  /** EVM chain id. Defaults to Base mainnet (8453). */
  chainId: ChainId;
  /** Optional token symbol, used only for logging/diagnostics. */
  symbol?: string;
  /**
   * Optional Chainlink aggregator address for this token's USD feed. When
   * present, the Chainlink provider can contribute an on-chain price.
   */
  chainlinkFeed?: string;
}

/** A single provider's answer. */
export interface ProviderQuote {
  source: string;
  usd: number;
  /** Epoch milliseconds when the quote was produced. */
  at: number;
}

export interface ProviderError {
  source: string;
  error: string;
}

/**
 * A price provider. Implementations must be side-effect free, honor the
 * AbortSignal, and resolve to `null` when they simply have no data for the
 * token (as opposed to throwing on a transient failure).
 */
export interface PriceProvider {
  readonly name: string;
  /** Whether this provider is usable in the current environment. */
  isConfigured(): boolean;
  fetchPrice(query: PriceQuery, signal: AbortSignal): Promise<number | null>;
}

/** The reconciled result returned to callers. */
export interface AggregatedPrice {
  /** Reconciled USD price for one whole token unit. */
  usd: number;
  /** Quotes that survived outlier rejection and fed into `usd`. */
  used: ProviderQuote[];
  /** Every successful quote, including those rejected as outliers. */
  quotes: ProviderQuote[];
  /** Providers that failed or had no data. */
  errors: ProviderError[];
  /** True when the value was served from cache without a fresh fetch. */
  cached: boolean;
  /** True when only stale cache was available because all providers failed. */
  stale: boolean;
}

export class PriceUnavailableError extends Error {
  readonly errors: ProviderError[];

  constructor(tokenAddress: string, errors: ProviderError[]) {
    super(
      `No USD price available for ${tokenAddress}. Tried: ${
        errors.map((e) => `${e.source} (${e.error})`).join(", ") || "no providers"
      }`,
    );
    this.name = "PriceUnavailableError";
    this.errors = errors;
  }
}
