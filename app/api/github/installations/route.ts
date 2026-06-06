import { NextResponse } from "next/server";
import {
  listInstallationsForGithubIdentity,
  listPaymentReceipts,
  listRepoConfigsForInstallations,
} from "@/lib/db/repositories";
import {
  getDefaultWalletAddress,
  getGithubIdentity,
  requirePrivyUser,
} from "@/lib/privy/server";

export async function GET(request: Request) {
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
}
