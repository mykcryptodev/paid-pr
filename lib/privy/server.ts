import { PrivyClient, type User } from "@privy-io/server-auth";
import { env } from "@/lib/env";

let client: PrivyClient | null = null;

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
    throw new Response("Missing Privy token", { status: 401 });
  }

  return getPrivyClient().getUser({ idToken: token });
}

export function getGithubIdentity(user: User) {
  const github = user.github;
  const subjectAsNumber = github?.subject ? Number(github.subject) : undefined;

  return {
    githubId: Number.isFinite(subjectAsNumber) ? subjectAsNumber : undefined,
    githubLogin: github?.username ?? undefined,
  };
}

export function getDefaultWalletAddress(user: User) {
  return user.wallet?.address ?? user.smartWallet?.address ?? undefined;
}
