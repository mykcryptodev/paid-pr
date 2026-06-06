import { Webhooks } from "@octokit/webhooks";
import { env } from "@/lib/env";
import {
  deleteInstallationByInstallationId,
  getInstallationByInstallationId,
  syncRepoConfigsForInstallation,
  upsertInstallation,
} from "@/lib/db/repositories";
import { listInstallationRepositories } from "@/lib/github/app";

type InstallationLike = {
  id: number;
  account?: {
    id?: number;
    login?: string;
    type?: string;
  } | null;
};

type SenderLike = {
  id?: number;
  login?: string;
};

type RepositoryLike = {
  full_name?: string;
};

export async function verifyGithubWebhook(input: {
  body: string;
  signature: string | null;
}) {
  if (!input.signature) {
    return false;
  }

  const webhooks = new Webhooks({ secret: env.githubWebhookSecret() });
  return webhooks.verify(input.body, input.signature);
}

export function getWebhookHeaders(request: Request) {
  return {
    event: request.headers.get("x-github-event"),
    signature: request.headers.get("x-hub-signature-256"),
    delivery: request.headers.get("x-github-delivery"),
  };
}

export async function syncInstallationFromWebhook(payload: {
  action?: string;
  installation?: InstallationLike;
  sender?: SenderLike;
  repositories?: RepositoryLike[];
  repositories_added?: RepositoryLike[];
  repositories_removed?: RepositoryLike[];
}) {
  const installation = payload.installation;

  if (!installation?.id) {
    return null;
  }

  if (payload.action === "deleted") {
    return deleteInstallationByInstallationId(installation.id);
  }

  if (!installation.account?.login || !installation.account.id) {
    return null;
  }

  let repos = (payload.repositories ?? [])
    .map((repo) => repo.full_name)
    .filter((repo): repo is string => Boolean(repo));
  const reposAdded = (payload.repositories_added ?? [])
    .map((repo) => repo.full_name)
    .filter((repo): repo is string => Boolean(repo));
  const reposRemoved = new Set(
    (payload.repositories_removed ?? [])
      .map((repo) => repo.full_name)
      .filter((repo): repo is string => Boolean(repo)),
  );

  if (!payload.repositories && (reposAdded.length > 0 || reposRemoved.size > 0)) {
    const existing = await getInstallationByInstallationId(installation.id);
    const mergedRepos = new Set([...(existing?.repositories ?? []), ...reposAdded]);

    for (const repo of reposRemoved) {
      mergedRepos.delete(repo);
    }

    repos = [...mergedRepos].sort();
  }

  if (repos.length === 0) {
    repos = await listInstallationRepositories(installation.id);
  }

  const row = await upsertInstallation(
    {
      installationId: installation.id,
      accountLogin: installation.account.login,
      accountId: installation.account.id,
      accountType: installation.account.type ?? "User",
      senderGithubId: payload.sender?.id,
      senderLogin: payload.sender?.login,
    },
    repos,
  );

  await syncRepoConfigsForInstallation(row.installationId, repos);

  return row;
}
