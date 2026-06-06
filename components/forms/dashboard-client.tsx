"use client";

import { useEffect, useMemo, useState } from "react";
import { useIdentityToken, useOAuthTokens, usePrivy } from "@privy-io/react-auth";
import { CircleHelp, Trash2 } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type RepoConfig = {
  repoFullName: string;
  priceUsdc: string;
  recipientAddress: string;
  enabled: boolean;
};

type PaymentReceipt = {
  id: number;
  repoFullName: string;
  prNumber: number | null;
  payerAddress: string | null;
  amountUsdc: string;
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

export function DashboardClient({ installationId }: DashboardClientProps) {
  const { authenticated, getAccessToken, login, logout, ready, user } = usePrivy();
  const { identityToken } = useIdentityToken();
  const [data, setData] = useState<InstallationsResponse | null>(null);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [priceUsdc, setPriceUsdc] = useState("0.05");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [trustedContributors, setTrustedContributors] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uninstallingRepo, setUninstallingRepo] = useState<string | null>(null);
  const [githubOAuthToken, setGithubOAuthToken] = useState<string | null>(null);

  const { reauthorize } = useOAuthTokens({
    onOAuthTokenGrant: ({ oAuthTokens }) => {
      if (oAuthTokens.provider === "github") {
        setGithubOAuthToken(oAuthTokens.accessToken);
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
        ...(githubOAuthToken ? { "github-oauth-token": githubOAuthToken } : {}),
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
        setPriceUsdc(first.priceUsdc);
        setRecipientAddress(
          first.recipientAddress.startsWith("0x0000")
            ? data.user.defaultWalletAddress ?? first.recipientAddress
            : first.recipientAddress,
        );
        setEnabled(first.enabled);
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, identityToken, installationId, githubOAuthToken]);

  const selectedConfig = useMemo(
    () => data?.repoConfigs.find((config) => config.repoFullName === selectedRepo),
    [data, selectedRepo],
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
    installationId &&
    !githubOAuthToken &&
    data?.repoConfigs.length === 0 &&
    data?.syncStatus?.reason === "missing_github_oauth_token";
  const signedInLabel =
    data?.user.github?.githubLogin ?? user?.github?.username ?? user?.id ?? "Privy user";

  function chooseRepo(repoFullName: string) {
    const config = data?.repoConfigs.find(
      (repoConfig) => repoConfig.repoFullName === repoFullName,
    );

    if (!config) {
      return;
    }

    setSelectedRepo(config.repoFullName);
    setPriceUsdc(config.priceUsdc);
    setRecipientAddress(config.recipientAddress);
    setEnabled(config.enabled);
    setTrustedContributors("");
  }

  async function uninstallRepo(repoFullName: string) {
    const confirmed = window.confirm(
      `Uninstall PaidPR from ${repoFullName}? The app will lose access to this repository.`,
    );

    if (!confirmed) {
      return;
    }

    setMessage(null);
    setUninstallingRepo(repoFullName);

    try {
      const response = await authFetch(
        `/api/github/installations/repo?repo=${encodeURIComponent(repoFullName)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as ErrorResponse;

      if (!response.ok) {
        setMessage(payload.error ?? "Unable to uninstall repository.");
        return;
      }

      if (selectedRepo === repoFullName) {
        setSelectedRepo("");
        setTrustedContributors("");
      }

      setMessage(`Uninstalled PaidPR from ${repoFullName}.`);
      await load();
    } finally {
      setUninstallingRepo(null);
    }
  }

  async function saveConfig() {
    setMessage(null);
    const response = await authFetch("/api/config", {
      method: "POST",
      body: JSON.stringify({
        repoFullName: selectedRepo,
        priceUsdc,
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
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                disabled={uninstallingRepo === config.repoFullName}
                aria-label={`Uninstall PaidPR from ${config.repoFullName}`}
                onClick={() => void uninstallRepo(config.repoFullName)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {data?.repoConfigs.length === 0 && (
            <Alert>
              <AlertTitle>No repos yet</AlertTitle>
              <AlertDescription>
                Install the GitHub App, then refresh this dashboard. For organization
                installs, authorize GitHub here so PaidPR can verify your org admin
                access.
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
              <Button
                variant="outline"
                onClick={() => void reauthorize({ provider: "github" })}
              >
                Authorize GitHub
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Repo payment config</CardTitle>
          <CardDescription>
            Set the x402 price, recipient wallet, and trusted wallet free-list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Repository</Label>
            <Input value={selectedRepo} onChange={(event) => setSelectedRepo(event.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Price USDC</Label>
              <Input value={priceUsdc} onChange={(event) => setPriceUsdc(event.target.value)} />
            </div>
            <div className="flex items-center gap-3 pt-7">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              <Label>Enabled</Label>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Recipient wallet</Label>
            <Input value={recipientAddress} onChange={(event) => setRecipientAddress(event.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label>Trusted contributor wallets</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="How trusted contributor wallets work"
                  >
                    <CircleHelp className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-sm text-left">
                  Wallets on this list can open PRs directly on GitHub without
                  paying. They must include a matching{" "}
                  <span className="font-mono">PaidPR-Trusted-Wallet</span> line
                  in the PR description.
                </TooltipContent>
              </Tooltip>
            </div>
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
              Current config: {selectedConfig.priceUsdc} USDC to{" "}
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
                <TableHead>Payer</TableHead>
                <TableHead>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.paymentReceipts.map((receipt) => (
                <TableRow key={receipt.id}>
                  <TableCell>{receipt.repoFullName}</TableCell>
                  <TableCell>{receipt.prNumber ? `#${receipt.prNumber}` : "Pending"}</TableCell>
                  <TableCell className="font-mono text-xs">{receipt.payerAddress ?? "Unknown"}</TableCell>
                  <TableCell>{receipt.amountUsdc} USDC</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
