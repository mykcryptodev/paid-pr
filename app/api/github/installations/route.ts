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

export async function GET(request: Request) {
  try {
    const user = await requirePrivyUser(request);
    const identity = getGithubIdentity(user);
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
    });
  } catch (error) {
    const response = authErrorResponse(error);

    if (response) {
      return response;
    }

    throw error;
  }
}
