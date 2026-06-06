import { PrivyClient, type User } from "@privy-io/server-auth";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

let client: PrivyClient | null = null;

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return null;
}

export function getPrivyClient() {
  if (!client) {
    const appId = env.privyAppId;

    if (!appId) {
      throw new Error("NEXT_PUBLIC_PRIVY_APP_ID is required for Privy auth.");
    }

    client = new PrivyClient(appId, env.privyAppSecret());
  }

  return client;
}

export function getAuthToken(request: Request) {
  const identityToken = request.headers.get("privy-id-token");

  if (identityToken) {
    return identityToken;
  }

  const authorization = request.headers.get("authorization");

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("privy-id-token="));

  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : null;
}

export async function requirePrivyUser(request: Request) {
  const token = getAuthToken(request);

  if (!token) {
    throw new AuthError("Missing Privy token");
  }

  try {
    const user = await getPrivyClient().getUser({ idToken: token });

    if (getGithubIdentity(user).githubId || getGithubIdentity(user).githubLogin) {
      return user;
    }

    // Identity-token user payloads can omit linked account details due to size.
    return await getPrivyClient().getUserById(user.id);
  } catch {
    throw new AuthError("Invalid Privy token");
  }
}

export function getGithubIdentity(user: User) {
  const github =
    user.github ??
    user.linkedAccounts.find((account) => account.type === "github_oauth");
  const subjectAsNumber = github?.subject ? Number(github.subject) : undefined;

  return {
    githubId: Number.isFinite(subjectAsNumber) ? subjectAsNumber : undefined,
    githubLogin: github?.username ?? undefined,
  };
}

export function getDefaultWalletAddress(user: User) {
  return user.wallet?.address ?? user.smartWallet?.address ?? undefined;
}
