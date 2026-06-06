import { NextResponse } from "next/server";
import { removeRepoFromInstallation } from "@/lib/db/repositories";
import {
  getAuthenticatedGithubUser,
  removeRepositoryFromInstallation,
} from "@/lib/github/app";
import { requireMaintainerForRepo } from "@/lib/privy/authorization";
import { AuthError, authErrorResponse } from "@/lib/privy/server";

type HttpError = Error & { status?: number };

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

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const repoFullName = url.searchParams.get("repo");
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

    await removeRepositoryFromInstallation({
      installationId: installation.installationId,
      repoFullName,
      githubOAuthToken,
    });

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
      return response;
    }

    if (error instanceof Error) {
      const status = (error as HttpError).status ?? 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    throw error;
  }
}
