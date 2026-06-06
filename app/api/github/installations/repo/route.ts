import { NextResponse } from "next/server";
import { removeRepoFromInstallation } from "@/lib/db/repositories";
import {
  getAuthenticatedGithubUser,
  removeRepositoryFromInstallation,
} from "@/lib/github/app";
import { requireMaintainerForRepo } from "@/lib/privy/authorization";
import { AuthError, authErrorResponse } from "@/lib/privy/server";

type HttpError = Error & { status?: number };
type GithubHttpError = HttpError & {
  request?: {
    method?: string;
    url?: string;
  };
  response?: {
    status?: number;
    data?: unknown;
    headers?: Record<string, string | number | undefined>;
  };
};

function normalizedLogin(login?: string) {
  return login?.toLowerCase();
}

function identityMatchesGithubUser(
  identity: { githubId?: number; githubLogin?: string },
  githubUser: { id: number; login: string },
) {
  return (
    (identity.githubId !== undefined && githubUser.id === identity.githubId) ||
    normalizedLogin(identity.githubLogin) === normalizedLogin(githubUser.login)
  );
}

function logDeleteRepoError(error: unknown, repoFullName: string | null) {
  if (!(error instanceof Error)) {
    return;
  }

  const githubError = error as GithubHttpError;

  console.error("Failed to remove repository from GitHub installation", {
    repoFullName,
    message: error.message,
    status: githubError.status ?? githubError.response?.status,
    request: githubError.request
      ? {
          method: githubError.request.method,
          url: githubError.request.url,
        }
      : undefined,
    responseData: githubError.response?.data,
    oauthScopes: githubError.response?.headers?.["x-oauth-scopes"],
    acceptedOauthScopes: githubError.response?.headers?.["x-accepted-oauth-scopes"],
    githubRequestId: githubError.response?.headers?.["x-github-request-id"],
  });
}

function isMissingAppInstallationError(error: unknown) {
  const githubError = error as GithubHttpError;

  return (
    (githubError.status ?? githubError.response?.status) === 404 &&
    githubError.request?.method === "POST" &&
    githubError.request.url?.includes("/app/installations/") &&
    githubError.request.url?.endsWith("/access_tokens")
  );
}

export async function DELETE(request: Request) {
  let repoFullName: string | null = null;

  try {
    const url = new URL(request.url);
    repoFullName = url.searchParams.get("repo");
    const githubOAuthToken = request.headers.get("github-oauth-token");

    if (!repoFullName) {
      return NextResponse.json({ error: "Missing repo" }, { status: 400 });
    }

    if (!githubOAuthToken) {
      throw new AuthError("Authorize GitHub before uninstalling this repository.", 403);
    }

    const { identity, installation } = await requireMaintainerForRepo(
      request,
      repoFullName,
    );
    const githubUser = await getAuthenticatedGithubUser(githubOAuthToken);

    if (!identityMatchesGithubUser(identity, githubUser)) {
      throw new AuthError("GitHub authorization does not match your Privy user.", 403);
    }

    if (installation.repositories.includes(repoFullName)) {
      try {
        await removeRepositoryFromInstallation({
          installationId: installation.installationId,
          repoFullName,
          githubOAuthToken,
        });
      } catch (error) {
        if (!isMissingAppInstallationError(error)) {
          throw error;
        }

        logDeleteRepoError(error, repoFullName);
      }
    }

    const updatedInstallation = await removeRepoFromInstallation(
      installation.installationId,
      repoFullName,
    );

    if (!updatedInstallation) {
      return NextResponse.json(
        { error: "Installation not found after uninstall" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      repoFullName,
      remainingRepos: updatedInstallation.repositories,
    });
  } catch (error) {
    const response = authErrorResponse(error);

    if (response) {
      logDeleteRepoError(error, repoFullName);
      return response;
    }

    if (error instanceof Error) {
      logDeleteRepoError(error, repoFullName);
      const status = (error as HttpError).status ?? 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    throw error;
  }
}
