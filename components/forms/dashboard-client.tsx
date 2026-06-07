"use client";

import { useEffect, useMemo, useState } from "react";
import { useIdentityToken, useOAuthTokens, usePrivy } from "@privy-io/react-auth";
import { Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
type RepoConfig = {
  githubInstallationId: number;
  repoFullName: string;
  priceMode: "usd" | "token";
  priceAmount: string;
  paymentTokenAddress: string;
  paymentTokenSymbol: string;
  paymentTokenDecimals: number;
  assetTransferMethod: "eip3009" | "permit2";
  chainlinkFeed: string | null;
  recipientAddress: string;
  enabled: boolean;
};

type TokenPreview = {
  token: {
    address: string;
    symbol: string;
    decimals: number;
    name: string;
    eip712Name: string;
    eip712Version: string;
    eip712Confirmed: boolean;
  };
  price: { usd: number; sources: string[]; stale: boolean } | null;
  priceError: string | null;
};

type GithubInstallation = {
  installationId: number;
  accountLogin: string;
  accountType: string;
};

type PullRequestStatus = "merged" | "open" | "closed" | "draft";

type PaymentReceipt = {
  id: number;
  repoFullName: string;
  prNumber: number | null;
  payerAddress: string | null;
  tokenSymbol: string | null;
  amountToken: string | null;
  amountUsd: string | null;
  txHash: string | null;
  prStatus: PullRequestStatus | null;
  createdAt: string;
};

type InstallationsResponse = {
  user: {
    id: string;
    github?: {
      githubId?: number;
      githubLogin?: string;
    };
    defaultWalletAddress?: string;
  };
  installations: GithubInstallation[];
  repoConfigs: RepoConfig[];
  paymentReceipts: PaymentReceipt[];
  syncStatus?: {
    synced: boolean;
    reason?: string;
    accountLogin?: string;
    accountType?: string;
    repoCount?: number;
  };
};

type ErrorResponse = {
  error?: string;
};

type DashboardClientProps = {
  installationId?: string;
};

const githubTokenStorageKey = "paidpr.githubOAuthToken";
const DEFAULT_TOKEN_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const DEFAULT_TOKEN_SYMBOL = "USDC";

const prStatusVariant: Record<
  PullRequestStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  merged: "default",
  open: "secondary",
  draft: "outline",
  closed: "destructive",
};

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

function getGitHubInstallationSettingsUrl(installationId?: number) {
  if (!installationId) {
    return "https://github.com/settings/installations";
  }

  return `https://github.com/settings/installations/${installationId}`;
}

export function DashboardClient({ installationId }: DashboardClientProps) {
  const { authenticated, getAccessToken, login, logout, ready, user } = usePrivy();
  const { identityToken } = useIdentityToken();
  const githubAppName = process.env.NEXT_PUBLIC_GITHUB_APP_NAME ?? "paid-pr";
  const githubInstallUrl = `https://github.com/apps/${githubAppName}/installations/new`;
  const [data, setData] = useState<InstallationsResponse | null>(null);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [priceMode, setPriceMode] = useState<"usd" | "token">("usd");
  const [priceAmount, setPriceAmount] = useState("0.05");
  const [paymentTokenAddress, setPaymentTokenAddress] =
    useState(DEFAULT_TOKEN_ADDRESS);
  const [paymentTokenSymbol, setPaymentTokenSymbol] =
    useState(DEFAULT_TOKEN_SYMBOL);
  const [assetTransferMethod, setAssetTransferMethod] = useState<
    "eip3009" | "permit2"
  >("eip3009");
  const [chainlinkFeed, setChainlinkFeed] = useState("");
  const [tokenPreview, setTokenPreview] = useState<TokenPreview | null>(null);
  const [isResolvingToken, setIsResolvingToken] = useState(false);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [trustedContributors, setTrustedContributors] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [githubOAuthToken, setGithubOAuthToken] = useState<string | null>(null);
  const githubLogin =
    data?.user.github?.githubLogin ?? user?.github?.username ?? undefined;
  const storedGithubOAuthToken = useMemo(
    () => readStoredGithubToken(githubLogin),
    [githubLogin],
  );
  const effectiveGithubOAuthToken = githubOAuthToken ?? storedGithubOAuthToken;

  useOAuthTokens({
    onOAuthTokenGrant: ({ oAuthTokens }) => {
      if (oAuthTokens.provider === "github") {
        setGithubOAuthToken(oAuthTokens.accessToken);
        storeGithubToken(githubLogin, oAuthTokens.accessToken);
        setMessage("GitHub authorized. Refreshing repositories...");
      }
    },
  });

  async function authFetch(path: string, init?: RequestInit) {
    const accessToken = identityToken ? null : await getAccessToken();

    return fetch(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(identityToken ? { "privy-id-token": identityToken } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(effectiveGithubOAuthToken
          ? { "github-oauth-token": effectiveGithubOAuthToken }
          : {}),
        ...init?.headers,
      },
    });
  }

  async function load() {
    if (!authenticated) {
      return;
    }

    setMessage(null);
    setIsLoading(true);
    try {
      const params = new URLSearchParams();

      if (installationId) {
        params.set("installation_id", installationId);
      }

      const response = await authFetch(
        `/api/github/installations${params.size ? `?${params.toString()}` : ""}`,
      );
      const payload = (await response.json()) as InstallationsResponse | ErrorResponse;

      if (!response.ok) {
        const error =
          "error" in payload ? payload.error : "Unable to load GitHub installations.";
        setMessage(error ?? "Unable to load GitHub installations.");
        return;
      }

      const data = payload as InstallationsResponse;
      setData(data);

      const first = data.repoConfigs[0];
      if (first && !selectedRepo) {
        setSelectedRepo(first.repoFullName);
        applyConfigToForm(first, data.user.defaultWalletAddress);
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, identityToken, installationId, effectiveGithubOAuthToken]);

  const selectedConfig = useMemo(
    () => data?.repoConfigs.find((config) => config.repoFullName === selectedRepo),
    [data, selectedRepo],
  );
  const addRepoUrl = getGitHubInstallationSettingsUrl(
    data?.repoConfigs[0]?.githubInstallationId ??
      data?.installations[0]?.installationId,
  );
  const syncDetail = data?.syncStatus
    ? [
        `sync=${data.syncStatus.reason ?? (data.syncStatus.synced ? "synced" : "not_synced")}`,
        data.syncStatus.accountLogin
          ? `account=${data.syncStatus.accountLogin}`
          : undefined,
        data.syncStatus.accountType ? `type=${data.syncStatus.accountType}` : undefined,
        data.syncStatus.repoCount !== undefined
          ? `repos=${data.syncStatus.repoCount}`
          : undefined,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  const shouldShowGitHubAuthorization =
    Boolean(data?.repoConfigs.length) ||
    (Boolean(installationId) &&
      data?.repoConfigs.length === 0 &&
      data?.syncStatus?.reason === "missing_github_oauth_token");
  const signedInLabel =
    githubLogin ?? user?.id ?? "Privy user";

  function applyConfigToForm(config: RepoConfig, defaultWalletAddress?: string) {
    setPriceMode(config.priceMode);
    setPriceAmount(config.priceAmount);
    setPaymentTokenAddress(config.paymentTokenAddress);
    setPaymentTokenSymbol(config.paymentTokenSymbol);
    setAssetTransferMethod(config.assetTransferMethod);
    setChainlinkFeed(config.chainlinkFeed ?? "");
    setTokenPreview(null);
    setRecipientAddress(
      config.recipientAddress.startsWith("0x0000")
        ? defaultWalletAddress ?? config.recipientAddress
        : config.recipientAddress,
    );
    setEnabled(config.enabled);
    setTrustedContributors("");
  }

  function chooseRepo(repoFullName: string) {
    const config = data?.repoConfigs.find(
      (repoConfig) => repoConfig.repoFullName === repoFullName,
    );

    if (!config) {
      return;
    }

    setSelectedRepo(config.repoFullName);
    applyConfigToForm(config, data?.user.defaultWalletAddress);
  }

  async function resolveToken() {
    setIsResolvingToken(true);
    setMessage(null);

    try {
      const params = new URLSearchParams({ address: paymentTokenAddress.trim() });
      if (chainlinkFeed.trim()) {
        params.set("chainlinkFeed", chainlinkFeed.trim());
      }

      const response = await authFetch(`/api/tokens/preview?${params.toString()}`);
      const payload = (await response.json()) as TokenPreview | ErrorResponse;

      if (!response.ok) {
        setTokenPreview(null);
        setMessage(
          "error" in payload ? payload.error ?? "Unable to resolve token." : "Unable to resolve token.",
        );
        return;
      }

      const preview = payload as TokenPreview;
      setTokenPreview(preview);
      setPaymentTokenSymbol(preview.token.symbol);
    } catch {
      setTokenPreview(null);
      setMessage("Unable to resolve token.");
    } finally {
      setIsResolvingToken(false);
    }
  }

  async function saveConfig() {
    setMessage(null);
    const response = await authFetch("/api/config", {
      method: "POST",
      body: JSON.stringify({
        repoFullName: selectedRepo,
        priceMode,
        priceAmount,
        paymentTokenAddress: paymentTokenAddress.trim(),
        assetTransferMethod,
        chainlinkFeed: chainlinkFeed.trim() || undefined,
        recipientAddress,
        enabled,
        trustedContributors: trustedContributors
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((walletAddress) => ({ walletAddress })),
      }),
    });

    if (!response.ok) {
      const payload = await response.json();
      setMessage(payload.error ?? "Unable to save config.");
      return;
    }

    setMessage("Repository config saved.");
    await load();
  }

  if (!ready) {
    return <Card><CardContent className="p-6">Loading Privy...</CardContent></Card>;
  }

  if (!authenticated) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connect your maintainer account</CardTitle>
          <CardDescription>
            Sign in with GitHub to manage installed PaidPR repos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => login({ loginMethods: ["github"] })}>
            Sign in with GitHub
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle>Installed repositories</CardTitle>
          <CardDescription>
            Repositories selected during the GitHub App installation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            className="w-full justify-between"
            onClick={logout}
          >
            <span>Signed in as {signedInLabel}</span>
            <span>Sign out</span>
          </Button>
          {data?.repoConfigs.map((config) => (
            <div
              key={config.repoFullName}
              className="flex w-full items-center gap-2 rounded-lg border p-3"
            >
              <button
                type="button"
                onClick={() => chooseRepo(config.repoFullName)}
                className="flex min-w-0 flex-1 items-center justify-between text-left hover:opacity-80"
              >
                <span className="truncate font-medium">{config.repoFullName}</span>
                <Badge
                  variant={config.enabled ? "default" : "secondary"}
                  className="ml-2 shrink-0"
                >
                  {config.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </button>
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <a
                  href={getGitHubInstallationSettingsUrl(
                    config.githubInstallationId,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Uninstall PaidPR from ${config.repoFullName}`}
                >
                  <Trash2 className="size-4" />
                </a>
              </Button>
            </div>
          ))}
          {data?.repoConfigs.length === 0 && (
            <Alert>
              <AlertTitle>No repos yet</AlertTitle>
              <AlertDescription className="space-y-3">
                <span className="block">
                Install the GitHub App, then refresh this dashboard. For organization
                installs, authorize GitHub here so PaidPR can verify your org admin
                access.
                </span>
                <Button asChild size="sm">
                  <a href={githubInstallUrl}>Install GitHub App</a>
                </Button>
                {syncDetail ? (
                  <span className="mt-2 block font-mono text-xs">{syncDetail}</span>
                ) : null}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => void load()}>
              {isLoading ? "Refreshing..." : "Refresh"}
            </Button>
            {shouldShowGitHubAuthorization && (
              <Button asChild variant="outline">
                <a href={addRepoUrl} target="_blank" rel="noreferrer">
                  Add repo
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Repo payment config</CardTitle>
          <CardDescription>
            Set the payment token, price, recipient wallet, and trusted wallet
            free-list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Repository</Label>
            <Input value={selectedRepo} onChange={(event) => setSelectedRepo(event.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Payment token (ERC-20 on Base)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="0x… token contract address"
                value={paymentTokenAddress}
                onChange={(event) => {
                  setPaymentTokenAddress(event.target.value);
                  setTokenPreview(null);
                }}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={isResolvingToken || !paymentTokenAddress.trim()}
                onClick={() => void resolveToken()}
              >
                {isResolvingToken ? "Resolving..." : "Resolve"}
              </Button>
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:no-underline"
              onClick={() => {
                setPaymentTokenAddress(DEFAULT_TOKEN_ADDRESS);
                setPaymentTokenSymbol(DEFAULT_TOKEN_SYMBOL);
                setTokenPreview(null);
              }}
            >
              Use USDC (default)
            </button>
            {tokenPreview && (
              <div className="rounded-md border bg-muted p-3 text-sm">
                <p>
                  <span className="font-medium">
                    {tokenPreview.token.symbol}
                  </span>{" "}
                  · {tokenPreview.token.decimals} decimals ·{" "}
                  {tokenPreview.token.name}
                </p>
                {tokenPreview.price ? (
                  <p className="mt-1 text-muted-foreground">
                    Live price: ${tokenPreview.price.usd.toPrecision(6)} (
                    {tokenPreview.price.sources.join(", ") || "no sources"}
                    {tokenPreview.price.stale ? ", cached" : ""})
                  </p>
                ) : (
                  <p className="mt-1 text-destructive">
                    {tokenPreview.priceError ?? "No USD price available."}
                  </p>
                )}
                {!tokenPreview.token.eip712Confirmed &&
                assetTransferMethod === "eip3009" ? (
                  <p className="mt-1 text-xs text-destructive">
                    Could not confirm this token&apos;s EIP-712 domain on-chain.
                    EIP-3009 signing may fail; consider the Permit2 transfer
                    method.
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Price mode</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={priceMode}
                onChange={(event) =>
                  setPriceMode(event.target.value as "usd" | "token")
                }
              >
                <option value="usd">Fixed USD (converted at pay time)</option>
                <option value="token">Fixed token amount</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>
                {priceMode === "usd"
                  ? "Price (USD)"
                  : `Price (${paymentTokenSymbol})`}
              </Label>
              <Input
                value={priceAmount}
                onChange={(event) => setPriceAmount(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Transfer method</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={assetTransferMethod}
                onChange={(event) =>
                  setAssetTransferMethod(
                    event.target.value as "eip3009" | "permit2",
                  )
                }
              >
                <option value="eip3009">EIP-3009 (USDC-style)</option>
                <option value="permit2">Permit2 (any ERC-20)</option>
              </select>
            </div>
            <div className="flex items-center gap-3 pt-7">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              <Label>Enabled</Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Chainlink USD feed (optional)</Label>
            <Input
              placeholder="0x… aggregator address (override)"
              value={chainlinkFeed}
              onChange={(event) => setChainlinkFeed(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Override the price oracle&apos;s on-chain feed for this token.
              Leave blank to use known feeds plus CoinGecko, DexScreener, and
              Thirdweb.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Recipient wallet</Label>
            <Input value={recipientAddress} onChange={(event) => setRecipientAddress(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Trusted contributor wallets</Label>
            <p className="text-sm text-muted-foreground">
              Allowlisted wallets bypass x402 enforcement for PRs opened on
              GitHub. Add one EVM address per line. The contributor must include
              this in the PR description:
            </p>
            <p className="rounded-md border bg-muted px-3 py-2 font-mono text-xs">
              PaidPR-Trusted-Wallet: 0xYourWalletAddress
            </p>
            <p className="text-sm text-muted-foreground">
              This only applies to PRs opened on GitHub. PRs created through
              PaidPR&apos;s paid API still require payment.
            </p>
            <textarea
              className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="0xabc...\n0xdef..."
              value={trustedContributors}
              onChange={(event) => setTrustedContributors(event.target.value)}
            />
          </div>
          {selectedConfig && (
            <p className="text-sm text-muted-foreground">
              Current config:{" "}
              {selectedConfig.priceMode === "usd"
                ? `$${selectedConfig.priceAmount} in ${selectedConfig.paymentTokenSymbol}`
                : `${selectedConfig.priceAmount} ${selectedConfig.paymentTokenSymbol}`}{" "}
              to{" "}
              <span className="font-mono">{selectedConfig.recipientAddress}</span>
            </p>
          )}
          {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
          <Button onClick={() => void saveConfig()} disabled={!selectedRepo}>
            Save config
          </Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
          <CardDescription>Recent receipts recorded after paid PR creation.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Repo</TableHead>
                <TableHead>PR</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Transaction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.paymentReceipts.map((receipt) => (
                <TableRow key={receipt.id}>
                  <TableCell>{receipt.repoFullName}</TableCell>
                  <TableCell>{receipt.prNumber ? `#${receipt.prNumber}` : "Pending"}</TableCell>
                  <TableCell>
                    {receipt.prStatus ? (
                      <Badge variant={prStatusVariant[receipt.prStatus]} className="capitalize">
                        {receipt.prStatus}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{receipt.payerAddress ?? "Unknown"}</TableCell>
                  <TableCell>
                    {receipt.amountToken ?? "—"} {receipt.tokenSymbol ?? ""}
                    {receipt.amountUsd
                      ? ` (≈ $${Number(receipt.amountUsd).toFixed(2)})`
                      : ""}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {receipt.txHash ? (
                      <a
                        href={`https://basescan.org/tx/${receipt.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline underline-offset-4 hover:no-underline"
                      >
                        {`${receipt.txHash.slice(0, 10)}…${receipt.txHash.slice(-8)}`}
                      </a>
                    ) : (
                      "Pending"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
