import { withX402 } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";
import {
  createPaymentReceipt,
  getRepoConfigWithTrusted,
  updatePaymentReceiptSettlement,
} from "@/lib/db/repositories";
import {
  canAuthenticatedUserAccessRepository,
  createPullRequestAsUser,
  getAuthenticatedGithubUser,
} from "@/lib/github/app";
import { getX402Server } from "@/lib/x402/server";
import { computePayment } from "@/lib/tokens/pricing";
import { PriceUnavailableError } from "@/lib/pricing";
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

  // Resolve the exact token and atomic amount to charge. In USD pricing mode
  // this queries the multi-source price oracle; if every source is down we
  // cannot price the PR and return 503 rather than guessing.
  let payment: Awaited<ReturnType<typeof computePayment>>;

  try {
    payment = await computePayment(repoConfig);
  } catch (error) {
    if (error instanceof PriceUnavailableError) {
      return NextResponse.json(
        {
          error:
            "Could not fetch a reliable USD price for the payment token right now. Please try again shortly.",
          details: error.errors,
        },
        { status: 503 },
      );
    }

    console.error("Failed to compute payment for PR", {
      repoFullName: parsed.data.repoFullName,
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Failed to compute the payment amount for this repository." },
      { status: 500 },
    );
  }

  // The on-chain transaction hash is only known after x402 settlement, which
  // runs *after* the handler below returns. We capture the receipt id here so
  // the tx hash can be backfilled from the settlement response.
  let createdReceiptId: number | null = null;

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
      // txHash is intentionally null here — the payment header is the signed
      // authorization, not the settled transaction. It is backfilled from the
      // settlement response after withX402 finishes (see below).
      const receipt = await createPaymentReceipt({
        txHash: null,
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
        tokenAddress: payment.tokenAddress,
        tokenSymbol: payment.tokenSymbol,
        tokenDecimals: payment.tokenDecimals,
        amountAtomic: payment.amountAtomic,
        amountToken: payment.amountDisplay,
        amountUsd: payment.amountUsd != null ? String(payment.amountUsd) : null,
        priceUsd: payment.usdPrice != null ? String(payment.usdPrice) : null,
        priceSources: payment.priceSources as Record<string, unknown> | null,
        receiptPayload,
      });
      createdReceiptId = receipt?.id ?? null;
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
        token: {
          address: payment.tokenAddress,
          symbol: payment.tokenSymbol,
          decimals: payment.tokenDecimals,
        },
        amount: payment.amountDisplay,
        amountAtomic: payment.amountAtomic,
        amountUsd: payment.amountUsd,
        recipientAddress: repoConfig.recipientAddress,
      },
    });
  };

  const response = await withX402<unknown>(
    handler,
    {
      accepts: {
        scheme: "exact",
        price: payment.price,
        network: payment.network,
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

  // After settlement, x402 sets the encoded settle response on the response
  // headers. Decode it to recover the on-chain transaction hash and backfill
  // the receipt that was created inside the handler.
  if (createdReceiptId !== null) {
    const settleResponse = decodePaymentPayload(
      response.headers.get("payment-response") ??
        response.headers.get("x-payment-response"),
    );
    const txHash = settleResponse?.transaction;
    const payer = settleResponse?.payer;

    if (typeof txHash === "string" && txHash.length > 0) {
      try {
        await updatePaymentReceiptSettlement({
          id: createdReceiptId,
          txHash,
          payerAddress: typeof payer === "string" ? payer : null,
        });
      } catch (error) {
        console.error("Failed to record settlement tx hash on receipt", {
          receiptId: createdReceiptId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }
  }

  return response;
}
