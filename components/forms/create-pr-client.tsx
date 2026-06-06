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

export function CreatePrClient() {
  const searchParams = useSearchParams();
  const [repoFullName, setRepoFullName] = useState(searchParams.get("repo") ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [labels, setLabels] = useState("");
  const [head, setHead] = useState("");
  const [base, setBase] = useState("main");
  const [repoResults, setRepoResults] = useState<RepoSearchResponse["repositories"]>(
    [],
  );
  const [sourceRepoFullName, setSourceRepoFullName] = useState("");
  const [prOptions, setPrOptions] = useState<PrOptionsResponse | null>(null);
  const [optionsMessage, setOptionsMessage] = useState<string | null>(null);
  const [isSearchingRepos, setIsSearchingRepos] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [payerAddress, setPayerAddress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void searchRepos(repoFullName);
    }, 250);

    return () => window.clearTimeout(timeout);
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
        labels: parseLabels(labels),
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
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <div>
            <h2 className="font-medium">1. Choose the target repository</h2>
            <p className="text-sm text-muted-foreground">
              Search enabled PaidPR repositories, or use a prefilled{" "}
              <span className="font-mono">?repo=owner/name</span> URL.
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
            <h2 className="font-medium">4. Pay and open the PR</h2>
            <p className="text-sm text-muted-foreground">
              The request still goes through the x402-gated PR creation API.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Payer wallet</Label>
            <Input
              placeholder="0x..."
              value={payerAddress}
              onChange={(event) => setPayerAddress(event.target.value)}
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
          <Button
            onClick={() => void submit()}
            disabled={isSubmitting || !repoFullName || !title || !head || !base}
          >
            {isSubmitting ? "Submitting..." : "Pay and open PR"}
          </Button>
        </section>
      </CardContent>
    </Card>
  );
}
