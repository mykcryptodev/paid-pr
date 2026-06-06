import {
  getInstallationForRepoConfigAndGithubIdentity,
  listInstallationsForGithubIdentity,
} from "@/lib/db/repositories";
import { AuthError, getGithubIdentity, requirePrivyUser } from "./server";

export async function requireMaintainerForRepo(
  request: Request,
  repoFullName: string,
) {
  const user = await requirePrivyUser(request);
  const identity = getGithubIdentity(user);
  const installations = await listInstallationsForGithubIdentity(
    identity.githubId,
    identity.githubLogin,
  );
  const authorizedInstallation = installations.find((installation) =>
    installation.repositories.includes(repoFullName),
  );

  if (authorizedInstallation) {
    return { user, identity, installation: authorizedInstallation };
  }

  const repoConfigInstallation =
    await getInstallationForRepoConfigAndGithubIdentity(
      repoFullName,
      identity.githubId,
      identity.githubLogin,
    );

  if (repoConfigInstallation) {
    return { user, identity, installation: repoConfigInstallation };
  }

  throw new AuthError("You do not manage this PaidPR repository.", 403);
}
