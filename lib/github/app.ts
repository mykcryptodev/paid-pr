import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { env } from "@/lib/env";

type GitHubInstallationAccount = {
  id?: number;
  login?: string;
  type?: string;
} | null;

export function getGitHubAppInstallUrl() {
  return `https://github.com/apps/${env.githubAppName}/installations/new`;
}

function createGitHubAppAuth() {
  return createAppAuth({
    appId: env.githubAppId(),
    privateKey: env.githubPrivateKey(),
  });
}

export async function getAppOctokit() {
  const appAuthentication = await createGitHubAppAuth()({ type: "app" });

  return new Octokit({ auth: appAuthentication.token });
}

export async function getInstallationAccessToken(installationId: number) {
  const auth = createGitHubAppAuth();

  const installationAuthentication = await auth({
    type: "installation",
    installationId,
  });

  return installationAuthentication.token;
}

export async function getInstallationOctokit(installationId: number) {
  const token = await getInstallationAccessToken(installationId);
  return new Octokit({ auth: token });
}

export async function getInstallationMetadata(installationId: number) {
  const octokit = await getAppOctokit();
  const { data } = await octokit.request(
    "GET /app/installations/{installation_id}",
    {
      installation_id: installationId,
    },
  );

  return {
    id: data.id,
    account: data.account as GitHubInstallationAccount,
  };
}

export async function listInstallationRepositories(installationId: number) {
  const octokit = await getInstallationOctokit(installationId);
  const repos = (await octokit.paginate("GET /installation/repositories", {
    per_page: 100,
  })) as Array<{ full_name?: string }>;

  return repos
    .map((repo) => repo.full_name)
    .filter((repo): repo is string => Boolean(repo));
}

export async function getRepositoryMetadata(input: {
  installationId: number;
  repoFullName: string;
}) {
  const [owner, repo] = input.repoFullName.split("/");

  if (!owner || !repo) {
    throw new Error("Invalid repository name.");
  }

  const octokit = await getInstallationOctokit(input.installationId);
  const { data } = await octokit.repos.get({ owner, repo });

  return {
    fullName: data.full_name,
    defaultBranch: data.default_branch,
  };
}

export async function listRepositoryBranches(input: {
  installationId: number;
  repoFullName: string;
}) {
  const [owner, repo] = input.repoFullName.split("/");

  if (!owner || !repo) {
    throw new Error("Invalid repository name.");
  }

  const octokit = await getInstallationOctokit(input.installationId);
  const branches = (await octokit.paginate(octokit.repos.listBranches, {
    owner,
    repo,
    per_page: 100,
  })) as Array<{ name?: string }>;

  return branches
    .map((branch) => branch.name)
    .filter((branch): branch is string => Boolean(branch));
}

export async function listRepositoryForks(input: {
  installationId: number;
  repoFullName: string;
}) {
  const [owner, repo] = input.repoFullName.split("/");

  if (!owner || !repo) {
    throw new Error("Invalid repository name.");
  }

  const octokit = await getInstallationOctokit(input.installationId);
  const forks = (await octokit.paginate(octokit.repos.listForks, {
    owner,
    repo,
    per_page: 100,
    sort: "newest",
  })) as Array<{
    full_name?: string;
    default_branch?: string;
    owner?: { login?: string | null } | null;
  }>;

  return forks
    .map((fork) => ({
      fullName: fork.full_name,
      ownerLogin: fork.owner?.login ?? null,
      defaultBranch: fork.default_branch,
    }))
    .filter(
      (
        fork,
      ): fork is {
        fullName: string;
        ownerLogin: string | null;
        defaultBranch: string;
      } => Boolean(fork.fullName && fork.defaultBranch),
    );
}

export async function listRepositoryLabels(input: {
  installationId: number;
  repoFullName: string;
}) {
  const [owner, repo] = input.repoFullName.split("/");

  if (!owner || !repo) {
    throw new Error("Invalid repository name.");
  }

  const octokit = await getInstallationOctokit(input.installationId);
  const labels = (await octokit.paginate(octokit.issues.listLabelsForRepo, {
    owner,
    repo,
    per_page: 100,
  })) as Array<{ name?: string; color?: string | null; description?: string | null }>;

  return labels
    .map((label) => ({
      name: label.name,
      color: label.color ?? null,
      description: label.description ?? null,
    }))
    .filter(
      (
        label,
      ): label is {
        name: string;
        color: string | null;
        description: string | null;
      } => Boolean(label.name),
    );
}

export async function getAuthenticatedGithubUser(githubOAuthToken: string) {
  const octokit = new Octokit({ auth: githubOAuthToken });
  const { data } = await octokit.request("GET /user");

  return {
    id: data.id,
    login: data.login,
  };
}

export async function canAuthenticatedUserAccessRepository(input: {
  githubOAuthToken: string;
  repoFullName: string;
}) {
  const [owner, repo] = input.repoFullName.split("/");

  if (!owner || !repo) {
    throw new Error("Invalid repository name.");
  }

  const octokit = new Octokit({ auth: input.githubOAuthToken });
  await octokit.repos.get({ owner, repo });
}

export async function createPullRequest(input: {
  installationId: number;
  repoFullName: string;
  title: string;
  body?: string;
  head: string;
  base: string;
  labels?: string[];
  draft?: boolean;
  maintainerCanModify?: boolean;
}) {
  const [owner, repo] = input.repoFullName.split("/");
  const octokit = await getInstallationOctokit(input.installationId);

  const { data } = await octokit.pulls.create({
    owner,
    repo,
    title: input.title,
    body: input.body,
    head: input.head,
    base: input.base,
    draft: input.draft,
    maintainer_can_modify: input.maintainerCanModify,
  });

  if (input.labels && input.labels.length > 0) {
    await octokit.issues.addLabels({
      owner,
      repo,
      issue_number: data.number,
      labels: input.labels,
    });
  }

  return data;
}

export async function createPullRequestAsUser(input: {
  githubOAuthToken: string;
  installationId: number;
  repoFullName: string;
  title: string;
  body?: string;
  head: string;
  base: string;
  labels?: string[];
  draft?: boolean;
  maintainerCanModify?: boolean;
}) {
  const [owner, repo] = input.repoFullName.split("/");

  if (!owner || !repo) {
    throw new Error("Invalid repository name.");
  }

  const userOctokit = new Octokit({ auth: input.githubOAuthToken });
  const { data } = await userOctokit.pulls.create({
    owner,
    repo,
    title: input.title,
    body: input.body,
    head: input.head,
    base: input.base,
    draft: input.draft,
    maintainer_can_modify: input.maintainerCanModify,
  });

  if (input.labels && input.labels.length > 0) {
    const installationOctokit = await getInstallationOctokit(input.installationId);

    try {
      await installationOctokit.issues.addLabels({
        owner,
        repo,
        issue_number: data.number,
        labels: input.labels,
      });
    } catch (error) {
      console.error("Failed to apply labels to user-created pull request", {
        repoFullName: input.repoFullName,
        pullNumber: data.number,
        labels: input.labels,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  return data;
}

export async function closePullRequestWithComment(input: {
  installationId: number;
  repoFullName: string;
  prNumber: number;
  comment: string;
}) {
  const [owner, repo] = input.repoFullName.split("/");
  const octokit = await getInstallationOctokit(input.installationId);

  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: input.prNumber,
    body: input.comment,
  });

  await octokit.pulls.update({
    owner,
    repo,
    pull_number: input.prNumber,
    state: "closed",
  });
}
