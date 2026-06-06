import { NextResponse } from "next/server";
import {
  findPaidReceiptForPullRequest,
  getRepoConfigWithTrusted,
} from "@/lib/db/repositories";
import { closePullRequestWithComment } from "@/lib/github/app";
import {
  getWebhookHeaders,
  syncInstallationFromWebhook,
  verifyGithubWebhook,
} from "@/lib/github/webhooks";

export const runtime = "nodejs";

function extractTrustedWallet(body?: string | null) {
  const match = body?.match(/PaidPR-Trusted-Wallet:\s*(0x[a-fA-F0-9]{40})/);
  return match?.[1]?.toLowerCase();
}

async function handlePullRequestOpened(payload: {
  action?: string;
  installation?: { id?: number };
  repository?: { full_name?: string };
  pull_request?: {
    number?: number;
    head?: { ref?: string };
    body?: string | null;
    html_url?: string;
  };
}) {
  if (payload.action !== "opened") {
    return;
  }

  const repoFullName = payload.repository?.full_name;
  const prNumber = payload.pull_request?.number;
  const installationId = payload.installation?.id;

  if (!repoFullName || !prNumber || !installationId) {
    return;
  }

  const config = await getRepoConfigWithTrusted(repoFullName);

  if (!config?.enabled) {
    return;
  }

  const trustedWallet = extractTrustedWallet(payload.pull_request?.body);
  const isTrusted =
    trustedWallet &&
    config.trustedContributors.some(
      (trusted) => trusted.walletAddress.toLowerCase() === trustedWallet,
    );

  if (isTrusted) {
    return;
  }

  const receipt = await findPaidReceiptForPullRequest({
    repoFullName,
    prNumber,
    headRef: payload.pull_request?.head?.ref,
  });

  if (receipt) {
    return;
  }

  const paymentUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/create?repo=${encodeURIComponent(repoFullName)}`;

  await closePullRequestWithComment({
    installationId,
    repoFullName,
    prNumber,
    comment: `Thanks for contributing. This repository is protected by PaidPR and requires a ${config.priceUsdc} USDC x402 payment before opening a PR.\n\nPlease reopen through ${paymentUrl}, or include a valid PaidPR receipt.`,
  });
}

export async function POST(request: Request) {
  const body = await request.text();
  const headers = getWebhookHeaders(request);
  const isValid = await verifyGithubWebhook({
    body,
    signature: headers.signature,
  });

  if (!isValid) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(body);

  if (
    headers.event === "installation" ||
    headers.event === "installation_repositories"
  ) {
    await syncInstallationFromWebhook(payload);
  }

  if (headers.event === "pull_request") {
    await handlePullRequestOpened(payload);
  }

  return NextResponse.json({ ok: true, event: headers.event });
}
