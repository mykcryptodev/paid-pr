import { listInstallationsForGithubIdentity } from "@/lib/db/repositories";
import { getGithubIdentity, requirePrivyUser } from "./server";

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

  if (!authorizedInstallation) {
    throw new Response("You do not manage this PaidPR repository.", {
      status: 403,
    });
  }

  return { user, identity, installation: authorizedInstallation };
}
