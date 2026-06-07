import { NextResponse } from "next/server";
import { getRepoConfigWithTrusted, updateRepoConfig } from "@/lib/db/repositories";
import {
  DEFAULT_TOKEN_ADDRESS,
  DEFAULT_TOKEN_DECIMALS,
  DEFAULT_TOKEN_EIP712_NAME,
  DEFAULT_TOKEN_EIP712_VERSION,
  DEFAULT_TOKEN_SYMBOL,
} from "@/lib/db/schema";
import { chainIdFromNetwork } from "@/lib/chain/client";
import { env } from "@/lib/env";
import { resolveTokenMetadata } from "@/lib/tokens/metadata";
import { requireMaintainerForRepo } from "@/lib/privy/authorization";
import { authErrorResponse } from "@/lib/privy/server";
import { updateConfigSchema } from "@/lib/validators/paidpr";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const parsed = updateConfigSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid config", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await requireMaintainerForRepo(request, parsed.data.repoFullName);

    // Resolve token metadata on-chain so symbol/decimals/EIP-712 domain are
    // trustworthy rather than client-supplied. The default USDC token is
    // short-circuited to avoid a needless RPC round-trip.
    const chainId = chainIdFromNetwork(env.x402Network);
    const isDefaultToken =
      parsed.data.paymentTokenAddress.toLowerCase() ===
      DEFAULT_TOKEN_ADDRESS.toLowerCase();

    let token = {
      symbol: DEFAULT_TOKEN_SYMBOL,
      decimals: DEFAULT_TOKEN_DECIMALS,
      eip712Name: DEFAULT_TOKEN_EIP712_NAME,
      eip712Version: DEFAULT_TOKEN_EIP712_VERSION,
    };

    if (!isDefaultToken) {
      try {
        const resolved = await resolveTokenMetadata(
          parsed.data.paymentTokenAddress,
          chainId,
        );
        token = {
          symbol: resolved.symbol,
          decimals: resolved.decimals,
          eip712Name: resolved.eip712Name,
          eip712Version: resolved.eip712Version,
        };
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
    }

    const config = await updateRepoConfig({
      repoFullName: parsed.data.repoFullName,
      priceMode: parsed.data.priceMode,
      priceAmount: parsed.data.priceAmount,
      paymentTokenAddress: parsed.data.paymentTokenAddress,
      paymentTokenSymbol: token.symbol,
      paymentTokenDecimals: token.decimals,
      paymentTokenName: token.eip712Name,
      paymentTokenVersion: token.eip712Version,
      assetTransferMethod: parsed.data.assetTransferMethod,
      chainlinkFeed: parsed.data.chainlinkFeed ?? null,
      recipientAddress: parsed.data.recipientAddress,
      enabled: parsed.data.enabled,
      trustedContributors: parsed.data.trustedContributors.map((trusted) => ({
        walletAddress: trusted.walletAddress,
        label: trusted.label || undefined,
      })),
    });

    if (!config) {
      return NextResponse.json({ error: "Repo config not found" }, { status: 404 });
    }

    return NextResponse.json({ config });
  } catch (error) {
    const response = authErrorResponse(error);

    if (response) {
      return response;
    }

    throw error;
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const repoFullName = url.searchParams.get("repo");

    if (!repoFullName) {
      return NextResponse.json({ error: "Missing repo" }, { status: 400 });
    }

    await requireMaintainerForRepo(request, repoFullName);
    const config = await getRepoConfigWithTrusted(repoFullName);

    if (!config) {
      return NextResponse.json({ error: "Repo config not found" }, { status: 404 });
    }

    return NextResponse.json({ config });
  } catch (error) {
    const response = authErrorResponse(error);

    if (response) {
      return response;
    }

    throw error;
  }
}
