import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { chainIdFromNetwork } from "@/lib/chain/client";
import { env } from "@/lib/env";
import { getTokenUsdPrice, PriceUnavailableError } from "@/lib/pricing";
import { resolveTokenMetadata } from "@/lib/tokens/metadata";

export const runtime = "nodejs";

/**
 * Resolves on-chain metadata and a live USD price for a token address so the
 * maintainer dashboard can preview the payment token before saving config.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get("address")?.trim() ?? "";
  const feed = url.searchParams.get("chainlinkFeed")?.trim() || undefined;

  if (!isAddress(address)) {
    return NextResponse.json(
      { error: "Provide a valid token contract address." },
      { status: 400 },
    );
  }

  const chainId = chainIdFromNetwork(env.x402Network);

  let metadata: Awaited<ReturnType<typeof resolveTokenMetadata>>;
  try {
    metadata = await resolveTokenMetadata(address, chainId);
  } catch (error) {
    return NextResponse.json(
      {
        error: `Could not read token metadata on-chain: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      },
      { status: 422 },
    );
  }

  let price: { usd: number; sources: string[]; stale: boolean } | null = null;
  let priceError: string | null = null;

  try {
    const result = await getTokenUsdPrice({
      tokenAddress: address,
      chainId,
      symbol: metadata.symbol,
      chainlinkFeed: feed,
    });
    price = {
      usd: result.usd,
      sources: result.used.map((q) => q.source),
      stale: result.stale,
    };
  } catch (error) {
    priceError =
      error instanceof PriceUnavailableError
        ? "No price source returned a USD price for this token."
        : "Failed to fetch a USD price for this token.";
  }

  return NextResponse.json({
    token: {
      address: metadata.address,
      symbol: metadata.symbol,
      decimals: metadata.decimals,
      name: metadata.name,
      eip712Name: metadata.eip712Name,
      eip712Version: metadata.eip712Version,
      eip712Confirmed: metadata.eip712Confirmed,
    },
    price,
    priceError,
  });
}
