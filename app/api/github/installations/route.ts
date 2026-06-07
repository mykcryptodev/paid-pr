import { NextResponse } from "next/server";
import {
  listInstallationsForGithubIdentity,
  listPaymentReceipts,
  listRepoConfigsForInstallations,
} from "@/lib/db/repositories";
import {
  authErrorResponse,
  getDefaultWalletAddress,
  getGithubIdentity,
  requirePrivyUser,
} from "@/lib/privy/server";
import { syncInstallationForGithubIdentity } from "@/lib/github/installations";
import { getPullRequestStatus, type PullRequestStatus } from "@/lib/github/app";

export async function GET(request: Request) {
  try {
    const user = await requirePrivyUser(request);
    const identity = getGithubIdentity(user);
    const url = new URL(request.url);
    const installationId = Number(url.searchParams.get("installation_id"));
    let syncStatus:
      | Awaited<ReturnType<typeof syncInstallationForGithubIdentity>>
      | {
          synced: false;
          reason: "missing_installation_id";
        } = { synced: false, reason: "missing_installation_id" };

    if (Number.isSafeInteger(installationId) && installationId > 0) {
      syncStatus = await syncInstallationForGithubIdentity(installationId, identity, {
        githubOAuthToken: request.headers.get("github-oauth-token"),
      });
    }

    const installations = await listInstallationsForGithubIdentity(
      identity.githubId,
      identity.githubLogin,
    );
    const configs = await listRepoConfigsForInstallations(
      installations.map((installation) => installation.installationId),
    );
    const receipts = await listPaymentReceipts(
      configs.map((config) => config.repoFullName),
    );

    const repoToInstallation = new Map(
      configs.map((config) => [
        config.repoFullName,
        config.githubInstallationId,
      ]),
    );
    const statusCache = new Map<string, Promise<PullRequestStatus | null>>();
    const receiptsWithStatus = await Promise.all(
      receipts.map(async (receipt) => {
        const installationId = repoToInstallation.get(receipt.repoFullName);

        if (!receipt.prNumber || !installationId) {
          return { ...receipt, prStatus: null };
        }

        const cacheKey = `${receipt.repoFullName}#${receipt.prNumber}`;
        let statusPromise = statusCache.get(cacheKey);

        if (!statusPromise) {
          statusPromise = getPullRequestStatus({
            installationId,
            repoFullName: receipt.repoFullName,
            prNumber: receipt.prNumber,
          });
          statusCache.set(cacheKey, statusPromise);
        }

        return { ...receipt, prStatus: await statusPromise };
      }),
    );

    return NextResponse.json({
      user: {
        id: user.id,
        github: identity,
        defaultWalletAddress: getDefaultWalletAddress(user),
      },
      installations,
      repoConfigs: configs,
      paymentReceipts: receiptsWithStatus,
      syncStatus,
    });
  } catch (error) {
    const response = authErrorResponse(error);

    if (response) {
      return response;
    }

    throw error;
  }
}
