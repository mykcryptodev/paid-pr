import { Octokit } from "@octokit/rest";
import {
  syncRepoConfigsForInstallation,
  upsertInstallation,
} from "@/lib/db/repositories";
import {
  getInstallationMetadata,
  listInstallationRepositories,
} from "@/lib/github/app";

type GithubIdentity = {
  githubId?: number;
  githubLogin?: string;
};

function normalizeLogin(login?: string) {
  return login?.toLowerCase();
}

function identityMatchesInstallationAccount(
  identity: GithubIdentity,
  account: { id?: number; login?: string } | null,
) {
  if (!account) {
    return false;
  }

  return (
    (identity.githubId !== undefined && account.id === identity.githubId) ||
    normalizeLogin(identity.githubLogin) === normalizeLogin(account.login)
  );
}

function identityMatchesGithubUser(
  identity: GithubIdentity,
  githubUser: { id?: number; login?: string },
) {
  return (
    (identity.githubId !== undefined && githubUser.id === identity.githubId) ||
    normalizeLogin(identity.githubLogin) === normalizeLogin(githubUser.login)
  );
}

async function canManageOrganizationInstallation(input: {
  githubOAuthToken?: string | null;
  identity: GithubIdentity;
  organizationLogin?: string;
}) {
  if (!input.githubOAuthToken || !input.organizationLogin) {
    return { authorized: false, reason: "missing_github_oauth_token" };
  }

  const octokit = new Octokit({ auth: input.githubOAuthToken });

  try {
    const [{ data: githubUser }, { data: membership }] = await Promise.all([
      octokit.request("GET /user"),
      octokit.request("GET /user/memberships/orgs/{org}", {
        org: input.organizationLogin,
      }),
    ]);

    const authorized =
      identityMatchesGithubUser(input.identity, githubUser) &&
      membership.state === "active" &&
      membership.role === "admin";

    return {
      authorized,
      reason: authorized ? "authorized" : "not_org_admin",
    };
  } catch {
    return { authorized: false, reason: "github_org_membership_check_failed" };
  }
}

export async function syncInstallationForGithubIdentity(
  installationId: number,
  identity: GithubIdentity,
  options: { githubOAuthToken?: string | null } = {},
) {
  const installation = await getInstallationMetadata(installationId);
  const accountType = installation.account?.type?.toLowerCase();
  const canSyncPersonalInstallation = identityMatchesInstallationAccount(
    identity,
    installation.account,
  );
  const organizationAuthorization = await canManageOrganizationInstallation({
    githubOAuthToken: options.githubOAuthToken,
    identity,
    organizationLogin:
      accountType === "organization" ? installation.account?.login : undefined,
  });

  if (!canSyncPersonalInstallation && !organizationAuthorization.authorized) {
    return {
      synced: false,
      accountLogin: installation.account?.login,
      accountType: installation.account?.type,
      reason:
        accountType === "organization"
          ? organizationAuthorization.reason
          : "github_identity_does_not_match_installation",
    };
  }

  if (!installation.account?.id || !installation.account.login) {
    return { synced: false, reason: "missing_installation_account" };
  }

  const repos = await listInstallationRepositories(installationId);
  const row = await upsertInstallation(
    {
      installationId,
      accountLogin: installation.account.login,
      accountId: installation.account.id,
      accountType: installation.account.type ?? "User",
      senderGithubId: identity.githubId,
      senderLogin: identity.githubLogin,
    },
    repos,
  );

  await syncRepoConfigsForInstallation(row.installationId, repos);

  return {
    synced: true,
    accountLogin: installation.account.login,
    accountType: installation.account.type,
    repoCount: repos.length,
    reason: "synced",
  };
}
