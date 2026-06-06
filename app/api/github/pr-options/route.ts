import { NextResponse } from "next/server";
import { getRepoConfig } from "@/lib/db/repositories";
import {
  getRepositoryMetadata,
  listRepositoryBranches,
  listRepositoryForks,
  listRepositoryLabels,
} from "@/lib/github/app";
import { repoFullNameSchema } from "@/lib/validators/paidpr";

export const runtime = "nodejs";

function toHeadRef(repoFullName: string, sourceRepoFullName: string, branch: string) {
  if (repoFullName === sourceRepoFullName) {
    return branch;
  }

  const [owner] = sourceRepoFullName.split("/");
  return `${owner}:${branch}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const repoResult = repoFullNameSchema.safeParse(url.searchParams.get("repo") ?? "");

  if (!repoResult.success) {
    return NextResponse.json({ error: "Use a valid owner/repo." }, { status: 400 });
  }

  const repoConfig = await getRepoConfig(repoResult.data);

  if (!repoConfig?.enabled) {
    return NextResponse.json(
      { error: "PaidPR is not enabled for this repository." },
      { status: 404 },
    );
  }

  const [repository, baseBranches, forks, labels] = await Promise.all([
    getRepositoryMetadata({
      installationId: repoConfig.githubInstallationId,
      repoFullName: repoConfig.repoFullName,
    }),
    listRepositoryBranches({
      installationId: repoConfig.githubInstallationId,
      repoFullName: repoConfig.repoFullName,
    }),
    listRepositoryForks({
      installationId: repoConfig.githubInstallationId,
      repoFullName: repoConfig.repoFullName,
    }),
    listRepositoryLabels({
      installationId: repoConfig.githubInstallationId,
      repoFullName: repoConfig.repoFullName,
    }),
  ]);

  const sourceRepositories = [
    {
      fullName: repository.fullName,
      defaultBranch: repository.defaultBranch,
      isBaseRepository: true,
    },
    ...forks.map((fork) => ({
      fullName: fork.fullName,
      defaultBranch: fork.defaultBranch,
      isBaseRepository: false,
    })),
  ];
  const requestedSourceRepo = url.searchParams.get("sourceRepo");
  const sourceRepo =
    sourceRepositories.find((repo) => repo.fullName === requestedSourceRepo) ??
    sourceRepositories[0];

  let sourceBranches: string[] = [];

  try {
    sourceBranches = await listRepositoryBranches({
      installationId: repoConfig.githubInstallationId,
      repoFullName: sourceRepo.fullName,
    });
  } catch {
    sourceBranches = [];
  }

  return NextResponse.json({
    repository,
    baseBranches: baseBranches.map((branch) => ({
      name: branch,
      isDefault: branch === repository.defaultBranch,
    })),
    sourceRepositories,
    selectedSourceRepo: sourceRepo.fullName,
    sourceBranches: sourceBranches.map((branch) => ({
      name: branch,
      head: toHeadRef(repoConfig.repoFullName, sourceRepo.fullName, branch),
      isDefault: branch === sourceRepo.defaultBranch,
    })),
    labels,
  });
}
