import { withX402 } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";
import {
  createPaymentReceipt,
  getRepoConfigWithTrusted,
} from "@/lib/db/repositories";
import {
  createPullRequestAsUser,
  getAuthenticatedGithubUser,
} from "@/lib/github/app";
import { getX402Server, toX402Price } from "@/lib/x402/server";
import { createPrSchema } from "@/lib/validators/paidpr";

export const runtime = "nodejs";

function decodePaymentPayload(header: string | null) {
  if (!header) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as
      | Record<string, unknown>
      | null;
  } catch {
    try {
      return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as
        | Record<string, unknown>
        | null;
    } catch {
      return null;
    }
  }
}

export async function POST(request: NextRequest) {
  const parsed = createPrSchema.safeParse(await request.clone().json());
  const githubOAuthToken = request.headers.get("github-oauth-token");

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid PR request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!githubOAuthToken) {
    return NextResponse.json(
      { error: "Authorize GitHub before paying so the PR is created by your user." },
      { status: 401 },
    );
  }

  const githubUser = await getAuthenticatedGithubUser(githubOAuthToken).catch(() => null);

  if (!githubUser) {
    return NextResponse.json(
      { error: "GitHub authorization is invalid or expired. Re-authorize GitHub and try again." },
      { status: 401 },
    );
  }

  const repoConfig = await getRepoConfigWithTrusted(parsed.data.repoFullName);

  if (!repoConfig?.enabled) {
    return NextResponse.json(
      { error: "PaidPR is not enabled for this repository." },
      { status: 404 },
    );
  }

  const handler = async (paidRequest: NextRequest) => {
    const pullRequest = await createPullRequestAsUser({
      githubOAuthToken,
      installationId: repoConfig.githubInstallationId,
      repoFullName: parsed.data.repoFullName,
      title: parsed.data.title,
      body: parsed.data.body,
      head: parsed.data.head,
      base: parsed.data.base,
      labels: parsed.data.labels,
      draft: parsed.data.draft,
      maintainerCanModify: parsed.data.maintainerCanModify,
    });
    const paymentHeader =
      paidRequest.headers.get("payment-signature") ??
      paidRequest.headers.get("x-payment");
    const receiptPayload = decodePaymentPayload(paymentHeader);

    await createPaymentReceipt({
      txHash: (receiptPayload?.transaction as string | undefined) ?? null,
      paymentId: paymentHeader,
      repoFullName: parsed.data.repoFullName,
      headRef: parsed.data.head,
      baseRef: parsed.data.base,
      prNumber: pullRequest.number,
      payerAddress:
        parsed.data.payerAddress ??
        ((receiptPayload?.payer as string | undefined) ||
          (receiptPayload?.from as string | undefined)) ??
        null,
      amountUsdc: repoConfig.priceUsdc,
      receiptPayload,
    });

    return NextResponse.json({
      ok: true,
      pullRequest: {
        number: pullRequest.number,
        url: pullRequest.html_url,
        title: pullRequest.title,
        creator: githubUser.login,
      },
      paidpr: {
        repoFullName: parsed.data.repoFullName,
        amountUsdc: repoConfig.priceUsdc,
        recipientAddress: repoConfig.recipientAddress,
      },
    });
  };

  return withX402(
    handler,
    {
      accepts: {
        scheme: "exact",
        price: toX402Price(repoConfig.priceUsdc),
        network: (process.env.X402_NETWORK ??
          "eip155:84532") as `${string}:${string}`,
        payTo: repoConfig.recipientAddress,
        maxTimeoutSeconds: 120,
      },
      description: `Open a pull request on ${repoConfig.repoFullName}`,
      mimeType: "application/json",
      serviceName: "PaidPR",
      extensions: {
        paidpr: {
          repoFullName: repoConfig.repoFullName,
          headRef: parsed.data.head,
          baseRef: parsed.data.base,
        },
      },
    },
    getX402Server(),
  )(request);
}
