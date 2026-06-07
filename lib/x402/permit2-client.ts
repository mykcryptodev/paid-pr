import {
  createPublicClient,
  createWalletClient,
  custom,
  type Chain,
  type EIP1193Provider,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import {
  createPermit2ApprovalTx,
  getPermit2AllowanceReadParams,
} from "@x402/evm/exact/client";

/**
 * Permit2 (any-ERC-20) settlement requires a one-time on-chain approval of the
 * canonical Permit2 contract by the payer, in addition to the per-payment
 * signature. The x402 client ships the helpers but never sends the approval, so
 * we drive it here from whatever EIP-1193 wallet the payer connected.
 *
 * EIP-3009 tokens (USDC/EURC) need none of this — they carry the authorization
 * in the signed payment itself.
 */

function chainForNetwork(network: string): Chain | undefined {
  switch (network) {
    case "eip155:8453":
      return base;
    case "eip155:84532":
      return baseSepolia;
    default:
      return undefined;
  }
}

/** Returns true when the wallet has already approved Permit2 for the amount. */
export async function hasPermit2Allowance(opts: {
  provider: EIP1193Provider;
  network: string;
  tokenAddress: `0x${string}`;
  owner: `0x${string}`;
  requiredAtomic: bigint;
}): Promise<boolean> {
  const client = createPublicClient({
    chain: chainForNetwork(opts.network),
    transport: custom(opts.provider),
  });
  const params = getPermit2AllowanceReadParams({
    tokenAddress: opts.tokenAddress,
    ownerAddress: opts.owner,
  });
  const allowance = (await client.readContract(params)) as bigint;
  return allowance >= opts.requiredAtomic;
}

/**
 * Sends the one-time `approve(Permit2, max)` transaction and waits for it to
 * confirm. Resolves to the transaction hash.
 */
export async function approvePermit2(opts: {
  provider: EIP1193Provider;
  network: string;
  tokenAddress: `0x${string}`;
  owner: `0x${string}`;
}): Promise<`0x${string}`> {
  const chain = chainForNetwork(opts.network);
  const walletClient = createWalletClient({
    account: opts.owner,
    chain,
    transport: custom(opts.provider),
  });
  const approval = createPermit2ApprovalTx(opts.tokenAddress);

  const hash = await walletClient.sendTransaction({
    account: opts.owner,
    chain,
    to: approval.to,
    data: approval.data,
  });

  const publicClient = createPublicClient({
    chain,
    transport: custom(opts.provider),
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
