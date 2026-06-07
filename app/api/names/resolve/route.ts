import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { resolveAddressName } from "@/lib/names/resolve";

export const runtime = "nodejs";

/**
 * Reverse-resolves a wallet address into a Basename/ENS name so the dashboard
 * can show the maintainer who a recipient address belongs to. Reads only
 * public on-chain data, so it mirrors the unauthenticated token preview route.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get("address")?.trim() ?? "";

  if (!isAddress(address)) {
    return NextResponse.json(
      { error: "Provide a valid wallet address." },
      { status: 400 },
    );
  }

  try {
    const resolved = await resolveAddressName(address);
    return NextResponse.json({
      name: resolved?.name ?? null,
      source: resolved?.source ?? null,
    });
  } catch {
    return NextResponse.json({ name: null, source: null });
  }
}
