import { NextResponse } from "next/server";
import { removeRepoFromInstallation } from "@/lib/db/repositories";
import { removeRepositoryFromInstallation } from "@/lib/github/app";
import { requireMaintainerForRepo } from "@/lib/privy/authorization";
import { authErrorResponse } from "@/lib/privy/server";

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const repoFullName = url.searchParams.get("repo");

    if (!repoFullName) {
      return NextResponse.json({ error: "Missing repo" }, { status: 400 });
    }

    const { installation } = await requireMaintainerForRepo(request, repoFullName);

    await removeRepositoryFromInstallation({
      installationId: installation.installationId,
      repoFullName,
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
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    throw error;
  }
}
