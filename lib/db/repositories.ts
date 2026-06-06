import { and, desc, eq, ilike, inArray, notInArray, or } from "drizzle-orm";
import { getDb } from "./index";
import {
  githubInstallations,
  paymentReceipts,
  repoConfigs,
  trustedContributors,
  type NewGithubInstallation,
  type NewRepoConfig,
} from "./schema";

export type RepoConfigWithTrusted = Awaited<
  ReturnType<typeof getRepoConfigWithTrusted>
>;

export async function upsertInstallation(
  installation: NewGithubInstallation,
  repos: string[],
) {
  const db = getDb();
  const [row] = await db
    .insert(githubInstallations)
    .values({
      ...installation,
      repositories: repos,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: githubInstallations.installationId,
      set: {
        accountLogin: installation.accountLogin,
        accountId: installation.accountId,
        accountType: installation.accountType,
        senderGithubId: installation.senderGithubId,
        senderLogin: installation.senderLogin,
        repositories: repos,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}

export async function getInstallationByInstallationId(installationId: number) {
  const [row] = await getDb()
    .select()
    .from(githubInstallations)
    .where(eq(githubInstallations.installationId, installationId))
    .limit(1);

  return row ?? null;
}

export async function deleteInstallationByInstallationId(installationId: number) {
  const [row] = await getDb()
    .delete(githubInstallations)
    .where(eq(githubInstallations.installationId, installationId))
    .returning();

  return row ?? null;
}

export async function ensureRepoConfigs(
  installationId: number,
  repos: string[],
  recipientAddress = "0x0000000000000000000000000000000000000000",
) {
  if (repos.length === 0) {
    return [];
  }

  const db = getDb();

  return db
    .insert(repoConfigs)
    .values(
      repos.map((repoFullName) => ({
        githubInstallationId: installationId,
        repoFullName,
        recipientAddress,
      })),
    )
    .onConflictDoNothing({ target: repoConfigs.repoFullName })
    .returning();
}

export async function removeRepoFromInstallation(
  installationId: number,
  repoFullName: string,
) {
  const installation = await getInstallationByInstallationId(installationId);

  if (!installation) {
    return null;
  }

  const updatedRepos = installation.repositories.filter(
    (repo) => repo !== repoFullName,
  );

  const [row] = await getDb()
    .update(githubInstallations)
    .set({
      repositories: updatedRepos,
      updatedAt: new Date(),
    })
    .where(eq(githubInstallations.installationId, installationId))
    .returning();

  if (!row) {
    return null;
  }

  await syncRepoConfigsForInstallation(installationId, updatedRepos);

  return row;
}

export async function syncRepoConfigsForInstallation(
  installationId: number,
  repos: string[],
) {
  const db = getDb();

  if (repos.length === 0) {
    await db
      .delete(repoConfigs)
      .where(eq(repoConfigs.githubInstallationId, installationId));

    return [];
  }

  await db
    .delete(repoConfigs)
    .where(
      and(
        eq(repoConfigs.githubInstallationId, installationId),
        notInArray(repoConfigs.repoFullName, repos),
      ),
    );

  return ensureRepoConfigs(installationId, repos);
}

export async function listRepoConfigsForInstallations(
  installationIds: number[],
) {
  if (installationIds.length === 0) {
    return [];
  }

  return getDb()
    .select()
    .from(repoConfigs)
    .where(inArray(repoConfigs.githubInstallationId, installationIds))
    .orderBy(repoConfigs.repoFullName);
}

export async function searchEnabledRepoConfigs(query: string) {
  const normalizedQuery = query.trim();

  return getDb()
    .select({
      repoFullName: repoConfigs.repoFullName,
    })
    .from(repoConfigs)
    .where(
      and(
        eq(repoConfigs.enabled, true),
        normalizedQuery
          ? ilike(repoConfigs.repoFullName, `%${normalizedQuery}%`)
          : undefined,
      ),
    )
    .orderBy(repoConfigs.repoFullName)
    .limit(20);
}

export async function listInstallationsForGithubIdentity(
  githubId?: number,
  githubLogin?: string,
) {
  if (!githubId && !githubLogin) {
    return [];
  }

  return getDb()
    .select()
    .from(githubInstallations)
    .where(
      or(
        githubId ? eq(githubInstallations.senderGithubId, githubId) : undefined,
        githubLogin ? eq(githubInstallations.senderLogin, githubLogin) : undefined,
        githubLogin ? eq(githubInstallations.accountLogin, githubLogin) : undefined,
      ),
    )
    .orderBy(githubInstallations.accountLogin);
}

export async function getRepoConfig(repoFullName: string) {
  const [row] = await getDb()
    .select()
    .from(repoConfigs)
    .where(eq(repoConfigs.repoFullName, repoFullName))
    .limit(1);

  return row ?? null;
}

export async function getRepoConfigWithTrusted(repoFullName: string) {
  const config = await getRepoConfig(repoFullName);

  if (!config) {
    return null;
  }

  const trusted = await getDb()
    .select()
    .from(trustedContributors)
    .where(eq(trustedContributors.repoConfigId, config.id))
    .orderBy(trustedContributors.walletAddress);

  return { ...config, trustedContributors: trusted };
}

export async function updateRepoConfig(input: {
  repoFullName: string;
  priceUsdc: string;
  recipientAddress: string;
  enabled: boolean;
  trustedContributors: Array<{ walletAddress: string; label?: string }>;
}) {
  const db = getDb();
  const [config] = await db
    .update(repoConfigs)
    .set({
      priceUsdc: input.priceUsdc,
      recipientAddress: input.recipientAddress,
      enabled: input.enabled,
      updatedAt: new Date(),
    })
    .where(eq(repoConfigs.repoFullName, input.repoFullName))
    .returning();

  if (!config) {
    return null;
  }

  await db
    .delete(trustedContributors)
    .where(eq(trustedContributors.repoConfigId, config.id));

  if (input.trustedContributors.length > 0) {
    await db.insert(trustedContributors).values(
      input.trustedContributors.map((trusted) => ({
        repoConfigId: config.id,
        walletAddress: trusted.walletAddress.toLowerCase(),
        label: trusted.label,
      })),
    );
  }

  return getRepoConfigWithTrusted(input.repoFullName);
}

export async function createPaymentReceipt(input: {
  txHash?: string | null;
  paymentId?: string | null;
  repoFullName: string;
  headRef?: string | null;
  baseRef?: string | null;
  prNumber?: number | null;
  payerAddress?: string | null;
  amountUsdc: string;
  receiptPayload?: Record<string, unknown> | null;
}) {
  const [receipt] = await getDb()
    .insert(paymentReceipts)
    .values(input)
    .returning();

  return receipt;
}

export async function findPaidReceiptForPullRequest(input: {
  repoFullName: string;
  prNumber?: number;
  headRef?: string;
}) {
  const conditions = [eq(paymentReceipts.repoFullName, input.repoFullName)];

  if (input.prNumber) {
    conditions.push(eq(paymentReceipts.prNumber, input.prNumber));
  }

  if (input.headRef) {
    conditions.push(eq(paymentReceipts.headRef, input.headRef));
  }

  const [receipt] = await getDb()
    .select()
    .from(paymentReceipts)
    .where(and(...conditions))
    .orderBy(desc(paymentReceipts.createdAt))
    .limit(1);

  return receipt ?? null;
}

export async function listPaymentReceipts(repoFullNames: string[]) {
  if (repoFullNames.length === 0) {
    return [];
  }

  return getDb()
    .select()
    .from(paymentReceipts)
    .where(inArray(paymentReceipts.repoFullName, repoFullNames))
    .orderBy(desc(paymentReceipts.createdAt));
}

export async function assertConfigInput(
  repoFullName: string,
): Promise<NewRepoConfig | null> {
  return getRepoConfig(repoFullName);
}
