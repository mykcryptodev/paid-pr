import { getAddress, type Abi } from "viem";
import { BASE_MAINNET_CHAIN_ID, getPublicClient } from "@/lib/chain/client";
import type { PriceProvider, PriceQuery } from "../types";

const AGGREGATOR_ABI = [
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    name: "latestRoundData",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const satisfies Abi;

/**
 * Conservative registry of well-known Chainlink USD aggregators on Base
 * mainnet, keyed by lowercased token address. Anything not listed here can
 * still supply a feed address per token via `query.chainlinkFeed`.
 */
const BASE_FEEDS: Record<number, Record<string, string>> = {
  [BASE_MAINNET_CHAIN_ID]: {
    // USDC -> USDC/USD
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913":
      "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B",
    // WETH -> ETH/USD
    "0x4200000000000000000000000000000000000006":
      "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
  },
};

/** Reject answers older than this; a stale feed is worse than no feed. */
const MAX_STALENESS_SECONDS = 24 * 60 * 60;

/**
 * Chainlink price feeds read directly from the chain. This is the most
 * manipulation-resistant source we have, but only covers tokens with a known
 * (registry or per-token configured) USD aggregator.
 */
export class ChainlinkProvider implements PriceProvider {
  readonly name = "chainlink";

  isConfigured(): boolean {
    return true;
  }

  async fetchPrice(query: PriceQuery): Promise<number | null> {
    const feed = this.resolveFeed(query);
    if (!feed) {
      return null;
    }

    const client = getPublicClient(query.chainId);
    const address = getAddress(feed);

    const [decimals, roundData] = await Promise.all([
      client.readContract({
        address,
        abi: AGGREGATOR_ABI,
        functionName: "decimals",
      }),
      client.readContract({
        address,
        abi: AGGREGATOR_ABI,
        functionName: "latestRoundData",
      }),
    ]);

    const answer = roundData[1];
    const updatedAt = roundData[3];
    if (answer <= BigInt(0)) {
      return null;
    }

    const ageSeconds = Math.floor(Date.now() / 1000) - Number(updatedAt);
    if (ageSeconds > MAX_STALENESS_SECONDS) {
      throw new Error(`stale feed (${ageSeconds}s old)`);
    }

    return Number(answer) / 10 ** Number(decimals);
  }

  private resolveFeed(query: PriceQuery): string | null {
    if (query.chainlinkFeed) {
      return query.chainlinkFeed;
    }
    return BASE_FEEDS[query.chainId]?.[query.tokenAddress.toLowerCase()] ?? null;
  }
}
