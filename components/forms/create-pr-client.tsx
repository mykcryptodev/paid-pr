"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
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

type PrOptionsResponse = {
  repository: {
    fullName: string;
    defaultBranch: string;
  };
  baseBranches: BranchOption[];
  sourceRepositories: SourceRepositoryOption[];
  selectedSourceRepo: string;
  sourceBranches: SourceBranchOption[];
};

type ErrorResponse = {
  error?: string;
};

const repoFullNamePattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function CreatePrClient() {
  const searchParams = useSearchParams();
  const [repoFullName, setRepoFullName] = useState(searchParams.get("repo") ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [head, setHead] = useState("");
  const [base, setBase] = useState("main");
  const [sourceRepoFullName, setSourceRepoFullName] = useState("");
  const [prOptions, setPrOptions] = useState<PrOptionsResponse | null>(null);
  const [optionsMessage, setOptionsMessage] = useState<string | null>(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [payerAddress, setPayerAddress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

      if (!base || !options.baseBranches.some((branch) => branch.name === base)) {
        setBase(defaultBase);
      }

      if (!head || !options.sourceBranches.some((branch) => branch.head === head)) {
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

    if (!repoFullNamePattern.test(repo)) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void loadPrOptions(repo);
    }, 400);

    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoFullName]);

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
    setChallenge(null);

    const response = await fetch("/api/create-pr", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        repoFullName,
        title,
        body,
        head,
        base,
        payerAddress: payerAddress || undefined,
      }),
    });

    const paymentRequired = response.headers.get("PAYMENT-REQUIRED");

    if (response.status === 402 && paymentRequired) {
      setChallenge(paymentRequired);
      setMessage(
        "Payment required. Retry this request with an x402-capable wallet/client to open the PR.",
      );
      setIsSubmitting(false);
      return;
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setMessage(payload?.error ?? "Unable to create PR.");
      setIsSubmitting(false);
      return;
    }

    setMessage(`Pull request opened: ${payload.pullRequest.url}`);
    setIsSubmitting(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Open a paid PR</CardTitle>
        <CardDescription>
          Submit PR details to the same x402-gated API used by agents and CLI tools.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Repository</Label>
            <div className="flex gap-2">
              <Input
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
          </div>
          <div className="space-y-2">
            <Label>Payer wallet</Label>
            <Input
              placeholder="0x..."
              value={payerAddress}
              onChange={(event) => setPayerAddress(event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Title</Label>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
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
            <p className="text-sm text-muted-foreground">
              Pick a fork, then choose one of its branches as the PR head.
            </p>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Head branch</Label>
            <Input
              list="paidpr-head-branches"
              placeholder={
                sourceRepoFullName && sourceRepoFullName !== repoFullName
                  ? "fork-owner:branch"
                  : "branch"
              }
              value={head}
              onChange={(event) => setHead(event.target.value)}
            />
            <datalist id="paidpr-head-branches">
              {prOptions?.sourceBranches.map((branch) => (
                <option key={branch.head} value={branch.head}>
                  {branch.name}
                  {branch.isDefault ? " (default)" : ""}
                </option>
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label>Base branch</Label>
            <Input
              list="paidpr-base-branches"
              value={base}
              onChange={(event) => setBase(event.target.value)}
            />
            <datalist id="paidpr-base-branches">
              {prOptions?.baseBranches.map((branch) => (
                <option key={branch.name} value={branch.name}>
                  {branch.isDefault ? "default" : ""}
                </option>
              ))}
            </datalist>
          </div>
        </div>
        {optionsMessage && (
          <Alert>
            <AlertTitle>GitHub branches</AlertTitle>
            <AlertDescription>{optionsMessage}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-2">
          <Label>Body</Label>
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Describe your change..."
          />
        </div>
        {message && (
          <Alert>
            <AlertTitle>Status</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {challenge && (
          <pre className="max-h-48 overflow-auto rounded-lg border bg-muted p-3 text-xs">
            {challenge}
          </pre>
        )}
        <Button onClick={() => void submit()} disabled={isSubmitting}>
          {isSubmitting ? "Submitting..." : "Pay and open PR"}
        </Button>
      </CardContent>
    </Card>
  );
}
