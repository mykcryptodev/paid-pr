import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  namehash,
  type Abi,
} from "viem";
import { base, mainnet } from "viem/chains";
import { env } from "@/lib/env";

/**
 * Reverse-resolves a wallet address into a human-readable name so the
 * maintainer dashboard can confirm it is sending payouts to the right place.
 *
 * Two namespaces are checked, in the order most relevant to a Base payments
 * app: a Basename (Base mainnet) first, then an ENS primary name (Ethereum
 * mainnet). Reads are routed through thirdweb's RPC when a client id is
 * configured, falling back to the app's configured/public RPC otherwise.
 */

// Base mainnet L2 resolver that stores Basename reverse records.
const BASENAME_L2_RESOLVER = "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD";

// ENSIP-11 coin type for Base mainnet (0x80000000 | 8453), used to build the
// reverse node `<address>.<coinType>.reverse`.
const BASE_REVERSE_COIN_TYPE = ((0x80000000 | 8453) >>> 0).toString(16);

const RESOLVER_NAME_ABI = [
  {
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ type: "string" }],
  },
] as const satisfies Abi;

/** thirdweb RPC URL for a chain id when a public client id is configured. */
function thirdwebRpcUrl(chainId: number): string | undefined {
  return env.thirdwebClientId
    ? `https://${chainId}.rpc.thirdweb.com/${env.thirdwebClientId}`
    : undefined;
}

const baseClient = createPublicClient({
  chain: base,
  transport: http(thirdwebRpcUrl(base.id) ?? env.baseRpcUrl),
});

const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(thirdwebRpcUrl(mainnet.id) ?? "https://eth.llamarpc.com"),
});

export type ResolvedName = {
  name: string;
  source: "basename" | "ens";
};

export async function resolveAddressName(
  address: string,
): Promise<ResolvedName | null> {
  if (!isAddress(address)) {
    return null;
  }

  const checksummed = getAddress(address);

  // 1. Basename reverse record on Base mainnet.
  try {
    const node = namehash(
      `${checksummed.slice(2).toLowerCase()}.${BASE_REVERSE_COIN_TYPE}.reverse`,
    );
    const basename = await baseClient.readContract({
      address: BASENAME_L2_RESOLVER,
      abi: RESOLVER_NAME_ABI,
      functionName: "name",
      args: [node],
    });

    if (basename) {
      return { name: basename, source: "basename" };
    }
  } catch {
    // Fall through to ENS.
  }

  // 2. ENS primary name on Ethereum mainnet.
  try {
    const ens = await mainnetClient.getEnsName({ address: checksummed });
    if (ens) {
      return { name: ens, source: "ens" };
    }
  } catch {
    // No name available.
  }

  return null;
}
