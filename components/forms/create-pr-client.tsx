"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
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

export function CreatePrClient() {
  const searchParams = useSearchParams();
  const [repoFullName, setRepoFullName] = useState(searchParams.get("repo") ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [head, setHead] = useState("");
  const [base, setBase] = useState("main");
  const [payerAddress, setPayerAddress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
            <Input
              placeholder="owner/repo"
              value={repoFullName}
              onChange={(event) => setRepoFullName(event.target.value)}
            />
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Head branch</Label>
            <Input value={head} onChange={(event) => setHead(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Base branch</Label>
            <Input value={base} onChange={(event) => setBase(event.target.value)} />
          </div>
        </div>
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
