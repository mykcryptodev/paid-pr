import { NextResponse } from "next/server";
import { getRepoConfig } from "@/lib/db/repositories";
import {
  getRepositoryMetadata,
  listRepositoryBranches,
  listRepositoryForks,
  listRepositoryLabels,
} from "@/lib/github/app";
import { computePayment } from "@/lib/tokens/pricing";
import { PriceUnavailableError } from "@/lib/pricing";
import { repoFullNameSchema } from "@/lib/validators/paidpr";

export const runtime = "nodejs";

type GithubHttpError = Error & {
  status?: number;
  response?: {
    status?: number;
    data?: unknown;
  };
};

function toHeadRef(repoFullName: string, sourceRepoFullName: string, branch: string) {
  if (repoFullName === sourceRepoFullName) {
    return branch;
  }

  const [owner] = sourceRepoFullName.split("/");
  return `${owner}:${branch}`;
}

function githubErrorResponse(error: unknown) {
  const githubError = error as GithubHttpError;
  const status = githubError.status ?? githubError.response?.status ?? 502;
  const message =
    error instanceof Error ? error.message : "Unable to load GitHub repository data.";

  console.error("Unable to load GitHub PR options", {
    status,
    message,
    details: githubError.response?.data,
  });

  return NextResponse.json(
    {
      error:
        status === 403
          ? "GitHub App cannot read this repository's branches. Grant the app Contents read access and reinstall or approve the updated installation."
          : `Unable to load GitHub repository data: ${message}`,
      github: githubError.response?.data,
    },
    { status: status >= 400 && status < 500 ? status : 502 },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const repoResult = repoFullNameSchema.safeParse(url.searchParams.get("repo") ?? "");

  if (!repoResult.success) {
    return NextResponse.json({ error: "Use a valid owner/repo." }, { status: 400 });
  }

  const repoConfig = await getRepoConfig(repoResult.data);

  if (!repoConfig?.enabled) {
    return NextResponse.json(
      { error: "PaidPR is not enabled for this repository." },
      { status: 404 },
    );
  }

  let repository: Awaited<ReturnType<typeof getRepositoryMetadata>>;
  let baseBranches: Awaited<ReturnType<typeof listRepositoryBranches>>;
  let forks: Awaited<ReturnType<typeof listRepositoryForks>>;
  let labels: Awaited<ReturnType<typeof listRepositoryLabels>>;

  try {
    [repository, baseBranches, forks, labels] = await Promise.all([
      getRepositoryMetadata({
        installationId: repoConfig.githubInstallationId,
        repoFullName: repoConfig.repoFullName,
      }),
      listRepositoryBranches({
        installationId: repoConfig.githubInstallationId,
        repoFullName: repoConfig.repoFullName,
      }),
      listRepositoryForks({
        installationId: repoConfig.githubInstallationId,
        repoFullName: repoConfig.repoFullName,
      }),
      listRepositoryLabels({
        installationId: repoConfig.githubInstallationId,
        repoFullName: repoConfig.repoFullName,
      }),
    ]);
  } catch (error) {
    return githubErrorResponse(error);
  }

  const sourceRepositories = [
    {
      fullName: repository.fullName,
      defaultBranch: repository.defaultBranch,
      isBaseRepository: true,
    },
    ...forks.map((fork) => ({
      fullName: fork.fullName,
      defaultBranch: fork.defaultBranch,
      isBaseRepository: false,
    })),
  ];
  const requestedSourceRepo = url.searchParams.get("sourceRepo");
  const sourceRepo =
    sourceRepositories.find((repo) => repo.fullName === requestedSourceRepo) ??
    sourceRepositories[0];

  let sourceBranches: string[] = [];

  try {
    sourceBranches = await listRepositoryBranches({
      installationId: repoConfig.githubInstallationId,
      repoFullName: sourceRepo.fullName,
    });
  } catch {
    sourceBranches = [];
  }

  // Price the PR for display so the client can show the cost and cap the
  // signed payment. A momentary oracle outage should not block branch
  // selection, so price failures degrade to nulls instead of erroring.
  let payment: Awaited<ReturnType<typeof computePayment>> | null = null;
  let priceError: string | null = null;

  try {
    payment = await computePayment(repoConfig);
  } catch (error) {
    priceError =
      error instanceof PriceUnavailableError
        ? "No reliable USD price is available for the payment token right now."
        : "Failed to compute the payment amount.";
    console.error("Unable to price PR options", {
      repoFullName: repoConfig.repoFullName,
      error: error instanceof Error ? error.message : error,
    });
  }

  return NextResponse.json({
    repository,
    payment: {
      priceMode: repoConfig.priceMode,
      priceAmount: repoConfig.priceAmount,
      recipientAddress: repoConfig.recipientAddress,
      network: payment?.network ?? process.env.X402_NETWORK ?? "eip155:8453",
      token: {
        address: repoConfig.paymentTokenAddress,
        symbol: repoConfig.paymentTokenSymbol,
        decimals: repoConfig.paymentTokenDecimals,
      },
      assetTransferMethod: repoConfig.assetTransferMethod,
      amount: payment?.amountDisplay ?? null,
      amountAtomic: payment?.amountAtomic ?? null,
      usdPrice: payment?.usdPrice ?? null,
      amountUsd: payment?.amountUsd ?? null,
      priceStale: payment?.priceSources?.stale ?? false,
      priceError,
    },
    baseBranches: baseBranches.map((branch) => ({
      name: branch,
      isDefault: branch === repository.defaultBranch,
    })),
    sourceRepositories,
    selectedSourceRepo: sourceRepo.fullName,
    sourceBranches: sourceBranches.map((branch) => ({
      name: branch,
      head: toHeadRef(repoConfig.repoFullName, sourceRepo.fullName, branch),
      isDefault: branch === sourceRepo.defaultBranch,
    })),
    labels,
  });
}
