"use client";

import { useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
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
  user: { defaultWalletAddress?: string };
  repoConfigs: RepoConfig[];
  paymentReceipts: PaymentReceipt[];
};

export function DashboardClient() {
  const { authenticated, login, logout, ready, getAccessToken } = usePrivy();
  const [data, setData] = useState<InstallationsResponse | null>(null);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [priceUsdc, setPriceUsdc] = useState("0.05");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [trustedContributors, setTrustedContributors] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function authFetch(path: string, init?: RequestInit) {
    const token = await getAccessToken();

    return fetch(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  }

  async function load() {
    if (!authenticated) {
      return;
    }

    setIsLoading(true);
    const response = await authFetch("/api/github/installations");
    const payload = (await response.json()) as InstallationsResponse;
    setData(payload);
    setIsLoading(false);

    const first = payload.repoConfigs[0];
    if (first && !selectedRepo) {
      setSelectedRepo(first.repoFullName);
      setPriceUsdc(first.priceUsdc);
      setRecipientAddress(
        first.recipientAddress.startsWith("0x0000")
          ? payload.user.defaultWalletAddress ?? first.recipientAddress
          : first.recipientAddress,
      );
      setEnabled(first.enabled);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  const selectedConfig = useMemo(
    () => data?.repoConfigs.find((config) => config.repoFullName === selectedRepo),
    [data, selectedRepo],
  );

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
          {data?.repoConfigs.map((config) => (
            <button
              key={config.repoFullName}
              onClick={() => chooseRepo(config.repoFullName)}
              className="flex w-full items-center justify-between rounded-lg border p-3 text-left hover:bg-accent"
            >
              <span className="font-medium">{config.repoFullName}</span>
              <Badge variant={config.enabled ? "default" : "secondary"}>
                {config.enabled ? "Enabled" : "Disabled"}
              </Badge>
            </button>
          ))}
          {data?.repoConfigs.length === 0 && (
            <Alert>
              <AlertTitle>No repos yet</AlertTitle>
              <AlertDescription>
                Install the GitHub App, then refresh this dashboard.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => void load()}>
              {isLoading ? "Refreshing..." : "Refresh"}
            </Button>
            <Button variant="ghost" onClick={logout}>Sign out</Button>
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
            <Label>Trusted contributor wallets</Label>
            <textarea
              className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="One wallet address per line"
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
