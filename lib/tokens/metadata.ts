import { getAddress, type Abi } from "viem";
import { getPublicClient } from "@/lib/chain/client";

const ERC20_ABI = [
  {
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    name: "version",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    // ERC-5267: the canonical way to read a contract's EIP-712 domain.
    name: "eip712Domain",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "fields", type: "bytes1" },
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
      { name: "salt", type: "bytes32" },
      { name: "extensions", type: "uint256[]" },
    ],
  },
] as const satisfies Abi;

export interface TokenMetadata {
  address: string;
  symbol: string;
  decimals: number;
  /** ERC-20 token name. */
  name: string;
  /** EIP-712 domain name used for EIP-3009/2612 signatures. */
  eip712Name: string;
  /** EIP-712 domain version used for EIP-3009/2612 signatures. */
  eip712Version: string;
  /** Whether an ERC-5267 / version() lookup confirmed the domain values. */
  eip712Confirmed: boolean;
}

/**
 * Resolves on-chain metadata for an ERC-20 token, including the EIP-712 domain
 * (name + version) needed to sign x402 `transferWithAuthorization` payments.
 *
 * The EIP-712 domain is read from ERC-5267 `eip712Domain()` when available,
 * falling back to `version()` and finally to the ERC-20 name with version "1".
 * When unconfirmed, `eip712Confirmed` is false so the caller can ask the
 * maintainer to verify before enabling EIP-3009 settlement.
 */
export async function resolveTokenMetadata(
  tokenAddress: string,
  chainId: number,
): Promise<TokenMetadata> {
  const client = getPublicClient(chainId);
  const address = getAddress(tokenAddress);

  const [symbol, decimals, name] = await Promise.all([
    client.readContract({ address, abi: ERC20_ABI, functionName: "symbol" }),
    client.readContract({ address, abi: ERC20_ABI, functionName: "decimals" }),
    client.readContract({ address, abi: ERC20_ABI, functionName: "name" }),
  ]);

  let eip712Name = name;
  let eip712Version = "1";
  let eip712Confirmed = false;

  try {
    const domain = await client.readContract({
      address,
      abi: ERC20_ABI,
      functionName: "eip712Domain",
    });
    // domain = [fields, name, version, chainId, verifyingContract, salt, ext]
    if (domain[1]) eip712Name = domain[1];
    if (domain[2]) eip712Version = domain[2];
    eip712Confirmed = true;
  } catch {
    try {
      const version = await client.readContract({
        address,
        abi: ERC20_ABI,
        functionName: "version",
      });
      if (version) {
        eip712Version = version;
        eip712Confirmed = true;
      }
    } catch {
      // Leave defaults; caller treats this as unconfirmed.
    }
  }

  return {
    address,
    symbol,
    decimals: Number(decimals),
    name,
    eip712Name,
    eip712Version,
    eip712Confirmed,
  };
}
