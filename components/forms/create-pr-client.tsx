"use client";

import { useSearchParams } from "next/navigation";
import {
  type SignTypedDataParams,
  useConnectWallet,
  useLinkAccount,
  useOAuthTokens,
  usePrivy,
  useSignTypedData,
  useWallets,
} from "@privy-io/react-auth";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type BranchOption = {
  name: string;
  isDefault: boolean;
};

type SourceBranchOption = BranchOption & {
  head: string;
};

type SourceRepositoryOption = {
  fullName: string;
  defaultBranch: string;
  isBaseRepository: boolean;
};

type LabelOption = {
  name: string;
  color: string | null;
  description: string | null;
};

type PrOptionsResponse = {
  repository: {
    fullName: string;
    defaultBranch: string;
  };
  payment: {
    priceUsdc: string;
    recipientAddress: string;
    network: string;
  };
  baseBranches: BranchOption[];
  sourceRepositories: SourceRepositoryOption[];
  selectedSourceRepo: string;
  sourceBranches: SourceBranchOption[];
  labels: LabelOption[];
};

type RepoSearchResponse = {
  repositories: Array<{
    fullName: string;
  }>;
};

type ErrorResponse = {
  error?: string;
};

const repoFullNamePattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const customBranchValue = "__paidpr_custom_branch__";
const githubTokenStorageKey = "paidpr.githubOAuthToken";

function getInitialLabels(searchParams: URLSearchParams) {
  return [
    searchParams.get("labels"),
    ...searchParams.getAll("label"),
  ]
    .filter((value): value is string => Boolean(value))
    .join(", ");
}

function toUsdcBaseUnits(priceUsdc: string) {
  const [whole = "0", fractional = ""] = priceUsdc.split(".");
  return (
    BigInt(whole) * BigInt(1_000_000) +
    BigInt(fractional.padEnd(6, "0").slice(0, 6))
  );
}

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function readStoredGithubToken(githubLogin?: string) {
  if (!githubLogin || typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.sessionStorage.getItem(githubTokenStorageKey);
    const parsed = stored
      ? (JSON.parse(stored) as { githubLogin?: string; token?: string })
      : null;

    return parsed?.githubLogin === githubLogin ? parsed.token ?? null : null;
  } catch {
    return null;
  }
}

function storeGithubToken(githubLogin: string | undefined, token: string) {
  if (!githubLogin || typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    githubTokenStorageKey,
    JSON.stringify({ githubLogin, token }),
  );
}

export function CreatePrClient() {
  const searchParams = useSearchParams();
  const { authenticated, login, ready, user } = usePrivy();
  const { connectWallet } = useConnectWallet();
  const { linkGithub } = useLinkAccount();
  const { wallets } = useWallets();
  const { signTypedData } = useSignTypedData();
  const initialHead = searchParams.get("head") ?? searchParams.get("branch") ?? "";
  const hasInitialBase = searchParams.has("base");
  const [repoFullName, setRepoFullName] = useState(searchParams.get("repo") ?? "");
  const [title, setTitle] = useState(searchParams.get("title") ?? "");
  const [body, setBody] = useState(searchParams.get("body") ?? "");
  const [labels, setLabels] = useState(getInitialLabels(searchParams));
  const [head, setHead] = useState(initialHead);
  const [base, setBase] = useState(searchParams.get("base") ?? "main");
  const [repoResults, setRepoResults] = useState<RepoSearchResponse["repositories"]>(
    [],
  );
  const [sourceRepoFullName, setSourceRepoFullName] = useState(
    searchParams.get("sourceRepo") ?? "",
  );
  const [prOptions, setPrOptions] = useState<PrOptionsResponse | null>(null);
  const [optionsMessage, setOptionsMessage] = useState<string | null>(null);
  const [isSearchingRepos, setIsSearchingRepos] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [githubOAuthToken, setGithubOAuthToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { reauthorize } = useOAuthTokens({
    onOAuthTokenGrant: ({ oAuthTokens }) => {
      if (oAuthTokens.provider === "github") {
        setGithubOAuthToken(oAuthTokens.accessToken);
        storeGithubToken(githubLogin, oAuthTokens.accessToken);
        setMessage("GitHub authorized. Your PR will be created by your GitHub user.");
      }
    },
  });
  const selectedWalletAddress = useMemo(
    () => wallets.find((wallet) => wallet.address)?.address ?? "",
    [wallets],
  );
  const githubLogin = user?.github?.username ?? undefined;
  const storedGithubOAuthToken = useMemo(
    () => readStoredGithubToken(githubLogin),
    [githubLogin],
  );
  const effectiveGithubOAuthToken = githubOAuthToken ?? storedGithubOAuthToken;
  const matchingHeadOption = prOptions?.sourceBranches.some(
    (branch) => branch.head === head,
  );
  const matchingBaseOption = prOptions?.baseBranches.some(
    (branch) => branch.name === base,
  );
  const headSelectValue = matchingHeadOption ? head : customBranchValue;
  const baseSelectValue = matchingBaseOption ? base : customBranchValue;
  const showManualHead =
    !prOptions?.sourceBranches.length || headSelectValue === customBranchValue;
  const showManualBase =
    !prOptions?.baseBranches.length || baseSelectValue === customBranchValue;

  useEffect(() => {
    if (githubLogin && githubOAuthToken) {
      storeGithubToken(githubLogin, githubOAuthToken);
    }
  }, [githubLogin, githubOAuthToken]);

  function parseLabels(value: string) {
    return value
      .split(/[\n,]/)
      .map((label) => label.trim())
      .filter(Boolean);
  }

  async function searchRepos(query: string) {
    setIsSearchingRepos(true);

    try {
      const params = new URLSearchParams({ q: query.trim() });
      const response = await fetch(`/api/github/pr-repositories?${params.toString()}`);
      const payload = (await response.json()) as RepoSearchResponse;

      setRepoResults(payload.repositories ?? []);
    } catch {
      setRepoResults([]);
    } finally {
      setIsSearchingRepos(false);
    }
  }

  async function loadPrOptions(repo: string, sourceRepo?: string) {
    const normalizedRepo = repo.trim();

    if (!repoFullNamePattern.test(normalizedRepo)) {
      setPrOptions(null);
      setOptionsMessage(null);
      return;
    }

    setIsLoadingOptions(true);
    setOptionsMessage(null);

    const params = new URLSearchParams({ repo: normalizedRepo });

    if (sourceRepo) {
      params.set("sourceRepo", sourceRepo);
    }

    try {
      const response = await fetch(`/api/github/pr-options?${params.toString()}`);
      const payload = (await response.json()) as PrOptionsResponse | ErrorResponse;

      if (!response.ok) {
        setPrOptions(null);
        setOptionsMessage(
          "error" in payload
            ? payload.error ?? "Unable to load GitHub branches."
            : "Unable to load GitHub branches.",
        );
        return;
      }

      const options = payload as PrOptionsResponse;
      const defaultBase =
        options.baseBranches.find((branch) => branch.isDefault)?.name ??
        options.baseBranches[0]?.name ??
        "main";
      const firstHeadBranch =
        options.sourceBranches.find((branch) => branch.name !== defaultBase) ??
        options.sourceBranches.find((branch) => branch.isDefault) ??
        options.sourceBranches[0];

      setPrOptions(options);
      setSourceRepoFullName(options.selectedSourceRepo);

      if (
        !base ||
        (!hasInitialBase &&
          base === "main" &&
          !options.baseBranches.some((branch) => branch.name === base))
      ) {
        setBase(defaultBase);
      }

      if (!head) {
        setHead(firstHeadBranch?.head ?? "");
      }

      if (options.sourceBranches.length === 0) {
        setOptionsMessage(
          `No readable branches found for ${options.selectedSourceRepo}. You can still type a GitHub head ref manually.`,
        );
      }
    } catch {
      setOptionsMessage("Unable to load GitHub branches.");
    } finally {
      setIsLoadingOptions(false);
    }
  }

  useEffect(() => {
    const repo = repoFullName.trim();

    if (!effectiveGithubOAuthToken) {
      return;
    }

    if (!repoFullNamePattern.test(repo)) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void loadPrOptions(repo, sourceRepoFullName);
    }, 400);

    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoFullName, effectiveGithubOAuthToken]);

  useEffect(() => {
    if (!effectiveGithubOAuthToken) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void searchRepos(repoFullName);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [repoFullName, effectiveGithubOAuthToken]);

  function chooseSourceRepo(nextSourceRepo: string) {
    setSourceRepoFullName(nextSourceRepo);
    void loadPrOptions(repoFullName, nextSourceRepo);
  }

  function changeRepoFullName(nextRepoFullName: string) {
    setRepoFullName(nextRepoFullName);

    if (!repoFullNamePattern.test(nextRepoFullName.trim())) {
      setPrOptions(null);
      setSourceRepoFullName("");
      setOptionsMessage(null);
    }
  }

  async function submit() {
    setIsSubmitting(true);
    setMessage(null);

    if (!selectedWalletAddress) {
      setMessage("Connect a wallet before paying for the PR.");
      setIsSubmitting(false);
      return;
    }

    if (!effectiveGithubOAuthToken) {
      setMessage("Authorize GitHub before paying so the PR is created by your user.");
      setIsSubmitting(false);
      return;
    }

    try {
      const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
        schemes: [
          {
            network: (prOptions?.payment.network ??
              "eip155:84532") as `${string}:${string}`,
            client: new ExactEvmScheme({
              address: selectedWalletAddress as `0x${string}`,
              signTypedData: async (typedData) => {
                const privyTypedData = {
                  domain: typedData.domain,
                  types: typedData.types,
                  primaryType: typedData.primaryType,
                  message: typedData.message,
                } as SignTypedDataParams;
                const { signature } = await signTypedData(
                  privyTypedData,
                  { address: selectedWalletAddress },
                );

                return signature as `0x${string}`;
              },
            }),
            ...(prOptions
              ? { maxValue: toUsdcBaseUnits(prOptions.payment.priceUsdc) }
              : {}),
          },
        ],
      });

      const response = await fetchWithPayment("/api/create-pr", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "github-oauth-token": effectiveGithubOAuthToken,
        },
        body: JSON.stringify({
          repoFullName,
          title,
          body,
          head,
          base,
          labels: parseLabels(labels),
          payerAddress: selectedWalletAddress,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(payload?.error ?? "Unable to create PR.");
        return;
      }

      setMessage(`Pull request opened: ${payload.pullRequest.url}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to pay and create PR.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function connectPayerWallet() {
    if (!authenticated) {
      login({ loginMethods: ["wallet"] });
      return;
    }

    connectWallet();
  }

  function authorizeGithub() {
    if (!authenticated) {
      login({ loginMethods: ["github"] });
      return;
    }

    if (githubLogin) {
      void reauthorize({ provider: "github" });
      return;
    }

    linkGithub();
  }

  if (!ready) {
    return (
      <Card>
        <CardContent className="p-6">Loading authentication...</CardContent>
      </Card>
    );
  }

  if (!effectiveGithubOAuthToken) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connect GitHub to create a PR</CardTitle>
          <CardDescription>
            PaidPR opens pull requests as your GitHub user. Authorize GitHub first,
            then you can pick branches and pay with your wallet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {githubLogin ? (
            <Alert>
              <AlertTitle>GitHub authorization needed</AlertTitle>
              <AlertDescription>
                You are signed in as {githubLogin}, but PaidPR needs a fresh GitHub
                authorization token to create the PR as you.
              </AlertDescription>
            </Alert>
          ) : null}
          {message && (
            <Alert>
              <AlertTitle>Status</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          <Button type="button" onClick={authorizeGithub}>
            {githubLogin ? "Authorize GitHub" : "Connect GitHub"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Open a paid PR</CardTitle>
        <CardDescription>
          Submit PR details to the same x402-gated API used by agents and CLI tools.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <div>
            <h2 className="font-medium">1. Choose the target repository</h2>
            <p className="text-sm text-muted-foreground">
              Search enabled PaidPR repositories, or use{" "}
              <span className="font-mono">?repo=owner/name&amp;branch=feature</span>.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Repository</Label>
            <div className="flex gap-2">
              <Input
                list="paidpr-repositories"
                placeholder="owner/repo"
                value={repoFullName}
                onChange={(event) => changeRepoFullName(event.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={isLoadingOptions || !repoFullNamePattern.test(repoFullName.trim())}
                onClick={() => void loadPrOptions(repoFullName, sourceRepoFullName)}
              >
                {isLoadingOptions ? "Loading..." : "Load"}
              </Button>
            </div>
            <datalist id="paidpr-repositories">
              {repoResults.map((repo) => (
                <option key={repo.fullName} value={repo.fullName} />
              ))}
            </datalist>
            <p className="text-sm text-muted-foreground">
              {isSearchingRepos ? "Searching repositories..." : "Select a result or type owner/repo."}
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="font-medium">2. Select source and base branches</h2>
            <p className="text-sm text-muted-foreground">
              Open from a branch in the base repository or from a fork of that repo.
            </p>
          </div>
          {prOptions && (
            <div className="space-y-2">
              <Label>Source repository</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={sourceRepoFullName}
                onChange={(event) => chooseSourceRepo(event.target.value)}
              >
                {prOptions.sourceRepositories.map((repo) => (
                  <option key={repo.fullName} value={repo.fullName}>
                    {repo.fullName}
                    {repo.isBaseRepository ? " (base repo)" : " (fork)"}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Head branch</Label>
              {prOptions?.sourceBranches.length ? (
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={headSelectValue}
                  onChange={(event) => {
                    if (event.target.value === customBranchValue) {
                      setHead(matchingHeadOption ? "" : head);
                      return;
                    }

                    setHead(event.target.value);
                  }}
                >
                  {prOptions.sourceBranches.map((branch) => (
                    <option key={branch.head} value={branch.head}>
                      {branch.head}
                      {branch.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                  <option value={customBranchValue}>Custom ref...</option>
                </select>
              ) : null}
              {showManualHead && (
                <Input
                  placeholder={
                    sourceRepoFullName && sourceRepoFullName !== repoFullName
                      ? "fork-owner:branch"
                      : "branch"
                  }
                  value={head}
                  onChange={(event) => setHead(event.target.value)}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Base branch</Label>
              {prOptions?.baseBranches.length ? (
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={baseSelectValue}
                  onChange={(event) => {
                    if (event.target.value === customBranchValue) {
                      setBase(matchingBaseOption ? "" : base);
                      return;
                    }

                    setBase(event.target.value);
                  }}
                >
                  {prOptions.baseBranches.map((branch) => (
                    <option key={branch.name} value={branch.name}>
                      {branch.name}
                      {branch.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                  <option value={customBranchValue}>Custom branch...</option>
                </select>
              ) : null}
              {showManualBase && (
                <Input value={base} onChange={(event) => setBase(event.target.value)} />
              )}
            </div>
          </div>
          {optionsMessage && (
            <Alert>
              <AlertTitle>GitHub branches</AlertTitle>
              <AlertDescription>{optionsMessage}</AlertDescription>
            </Alert>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="font-medium">3. Enter PR details</h2>
            <p className="text-sm text-muted-foreground">
              Add the title, description, and labels that should be applied on GitHub.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Body</Label>
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Describe your change..."
            />
          </div>
          <div className="space-y-2">
            <Label>Labels</Label>
            <Input
              list="paidpr-labels"
              placeholder="bug, docs, enhancement"
              value={labels}
              onChange={(event) => setLabels(event.target.value)}
            />
            <datalist id="paidpr-labels">
              {prOptions?.labels.map((label) => (
                <option key={label.name} value={label.name}>
                  {label.description ?? ""}
                </option>
              ))}
            </datalist>
            <p className="text-sm text-muted-foreground">
              Separate labels with commas or new lines. Existing repo labels are suggested.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="font-medium">4. Connect GitHub and wallet</h2>
            <p className="text-sm text-muted-foreground">
              GitHub creates the PR as your user; your wallet pays the x402 cost.
            </p>
          </div>
          {prOptions?.payment && (
            <div className="rounded-lg border bg-muted p-3 text-sm">
              <p>
                Cost:{" "}
                <span className="font-medium">
                  {prOptions.payment.priceUsdc} USDC
                </span>{" "}
                on <span className="font-mono">{prOptions.payment.network}</span>
              </p>
              <p className="mt-1 break-all text-muted-foreground">
                Recipient: {prOptions.payment.recipientAddress}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">GitHub creator</p>
              <p className="text-sm text-muted-foreground">
                {githubLogin
                  ? `Signed in as ${githubLogin}${effectiveGithubOAuthToken ? "" : " (authorization needed)"}`
                  : "No GitHub user connected"}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!ready}
              onClick={authorizeGithub}
            >
              {effectiveGithubOAuthToken
                ? "Re-authorize GitHub"
                : githubLogin
                  ? "Authorize GitHub"
                  : "Connect GitHub"}
            </Button>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Payer wallet</p>
              <p className="text-sm text-muted-foreground">
                {selectedWalletAddress
                  ? truncateAddress(selectedWalletAddress)
                  : "No wallet connected"}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!ready}
              onClick={connectPayerWallet}
            >
              {selectedWalletAddress ? "Change wallet" : "Connect wallet"}
            </Button>
          </div>
          {message && (
            <Alert>
              <AlertTitle>Status</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          <Button
            onClick={() => void submit()}
            disabled={
              isSubmitting ||
              !repoFullName ||
              !title ||
              !head ||
              !base ||
              !selectedWalletAddress ||
              !effectiveGithubOAuthToken
            }
          >
            {isSubmitting ? "Submitting..." : "Pay and open PR"}
          </Button>
        </section>
      </CardContent>
    </Card>
  );
}
