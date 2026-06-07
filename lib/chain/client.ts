import { createPublicClient, http, type PublicClient } from "viem";
import { base, baseSepolia } from "viem/chains";
import { env } from "@/lib/env";

export const BASE_MAINNET_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

const clients = new Map<number, PublicClient>();

/**
 * Returns a cached viem public client for the given chain id. Only the two
 * Base networks are supported today; extend the switch to add more.
 */
export function getPublicClient(chainId: number): PublicClient {
  const cached = clients.get(chainId);
  if (cached) {
    return cached;
  }

  let client: PublicClient;
  switch (chainId) {
    case BASE_MAINNET_CHAIN_ID:
      client = createPublicClient({
        chain: base,
        transport: http(env.baseRpcUrl),
      }) as PublicClient;
      break;
    case BASE_SEPOLIA_CHAIN_ID:
      client = createPublicClient({
        chain: baseSepolia,
        transport: http(env.baseSepoliaRpcUrl),
      }) as PublicClient;
      break;
    default:
      throw new Error(`Unsupported chain id for on-chain reads: ${chainId}`);
  }

  clients.set(chainId, client);
  return client;
}

/** Maps an x402 network string (CAIP-2) to an EVM chain id. */
export function chainIdFromNetwork(network: string): number {
  const [, reference] = network.split(":");
  const chainId = Number(reference);
  if (!Number.isFinite(chainId)) {
    throw new Error(`Cannot derive chain id from network "${network}"`);
  }
  return chainId;
}
