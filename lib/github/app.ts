import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { env } from "@/lib/env";

export function getGitHubAppInstallUrl() {
  return `https://github.com/apps/${env.githubAppName}/installations/new`;
}

export async function getInstallationAccessToken(installationId: number) {
  const auth = createAppAuth({
    appId: env.githubAppId(),
    privateKey: env.githubPrivateKey(),
  });

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

export async function createPullRequest(input: {
  installationId: number;
  repoFullName: string;
  title: string;
  body?: string;
  head: string;
  base: string;
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
