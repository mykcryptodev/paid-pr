import { NextResponse } from "next/server";
import { getRepoConfigWithTrusted, updateRepoConfig } from "@/lib/db/repositories";
import { requireMaintainerForRepo } from "@/lib/privy/authorization";
import { authErrorResponse } from "@/lib/privy/server";
import { updateConfigSchema } from "@/lib/validators/paidpr";

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

    const config = await updateRepoConfig({
      ...parsed.data,
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
