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

    return NextResponse.json({
      user: {
        id: user.id,
        github: identity,
        defaultWalletAddress: getDefaultWalletAddress(user),
      },
      installations,
      repoConfigs: configs,
      paymentReceipts: receipts,
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
