import { NextResponse } from "next/server";
import { requireMaintainerForRepo } from "@/lib/privy/authorization";
import { authErrorResponse } from "@/lib/privy/server";

function getGitHubInstallationSettingsUrl(input: {
  installationId: number;
}) {
  return `https://github.com/settings/installations/${input.installationId}`;
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const repoFullName = url.searchParams.get("repo");

    if (!repoFullName) {
      return NextResponse.json({ error: "Missing repo" }, { status: 400 });
    }

    const { installation } = await requireMaintainerForRepo(
      request,
      repoFullName,
    );

    return NextResponse.json(
      {
        error:
          "Uninstall this repository from the GitHub app installation settings. GitHub will notify PaidPR by webhook after access is removed.",
        settingsUrl: getGitHubInstallationSettingsUrl({
          installationId: installation.installationId,
        }),
      },
      { status: 409 },
    );
  } catch (error) {
    const response = authErrorResponse(error);

    if (response) {
      return response;
    }

    throw error;
  }
}
