import { Webhooks } from "@octokit/webhooks";
import { env } from "@/lib/env";
import { ensureRepoConfigs, upsertInstallation } from "@/lib/db/repositories";

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
  installation?: InstallationLike;
  sender?: SenderLike;
  repositories?: RepositoryLike[];
  repositories_added?: RepositoryLike[];
  repositories_removed?: RepositoryLike[];
}) {
  const installation = payload.installation;

  if (!installation?.id || !installation.account?.login || !installation.account.id) {
    return null;
  }

  const repos = [
    ...(payload.repositories ?? []),
    ...(payload.repositories_added ?? []),
  ]
    .map((repo) => repo.full_name)
    .filter((repo): repo is string => Boolean(repo));

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

  await ensureRepoConfigs(row.installationId, repos);

  return row;
}
