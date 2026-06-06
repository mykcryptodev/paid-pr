import { withX402 } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";
import {
  createPaymentReceipt,
  getRepoConfigWithTrusted,
} from "@/lib/db/repositories";
import {
  canAuthenticatedUserAccessRepository,
  createPullRequestAsUser,
  getAuthenticatedGithubUser,
} from "@/lib/github/app";
import { getX402Server, toX402Price } from "@/lib/x402/server";
import { createPrSchema } from "@/lib/validators/paidpr";

export const runtime = "nodejs";

type GithubHttpError = Error & {
  status?: number;
  response?: {
    status?: number;
    data?: unknown;
  };
};

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

function getGithubErrorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      status: 502,
      message: "GitHub request failed.",
      details: undefined,
    };
  }

  const githubError = error as GithubHttpError;
  const status = githubError.status ?? githubError.response?.status ?? 502;

  return {
    status: status >= 400 && status < 500 ? status : 502,
    message: error.message || "GitHub request failed.",
    details: githubError.response?.data,
  };
}

function githubErrorResponse(error: unknown, prefix: string): NextResponse<unknown> {
  const details = getGithubErrorDetails(error);

  console.error(prefix, {
    status: details.status,
    message: details.message,
    details: details.details,
  });

  return NextResponse.json(
    {
      error: `${prefix}: ${details.message}`,
      github: details.details,
    },
    { status: details.status },
  );
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

  try {
    await canAuthenticatedUserAccessRepository({
      githubOAuthToken,
      repoFullName: parsed.data.repoFullName,
    });
  } catch (error) {
    return githubErrorResponse(
      error,
      "GitHub cannot access the target repository with your user token",
    );
  }

  const handler = async (paidRequest: NextRequest): Promise<NextResponse<unknown>> => {
    let pullRequest: Awaited<ReturnType<typeof createPullRequestAsUser>>;

    try {
      pullRequest = await createPullRequestAsUser({
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
    } catch (error) {
      return githubErrorResponse(
        error,
        "Payment verified, but GitHub could not create the PR",
      );
    }

    const paymentHeader =
      paidRequest.headers.get("payment-signature") ??
      paidRequest.headers.get("x-payment");
    const receiptPayload = decodePaymentPayload(paymentHeader);

    try {
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
    } catch (error) {
      console.error("Pull request created, but failed to record payment receipt", {
        repoFullName: parsed.data.repoFullName,
        pullNumber: pullRequest.number,
        error: error instanceof Error ? error.message : error,
      });
    }

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

  return withX402<unknown>(
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
