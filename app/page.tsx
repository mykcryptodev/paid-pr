import Link from "next/link";
import { ArrowRight, Bot, GitPullRequest, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getGitHubAppInstallUrl } from "@/lib/github/app";

export default function Home() {
  const installUrl = getGitHubAppInstallUrl();

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-5 w-5" />
          PaidPR
        </div>
        <nav className="flex items-center gap-3">
          <Button asChild variant="ghost">
            <Link href="/create">Open PR</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </nav>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-16">
        <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-6">
            <div className="inline-flex rounded-full border px-3 py-1 text-sm text-muted-foreground">
              x402-gated GitHub pull requests for humans and agents
            </div>
            <h1 className="max-w-3xl text-5xl font-semibold tracking-tight">
              Make every external PR pay the maintainer first.
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Install one GitHub App, set a per-repo USDC price and recipient
              wallet, then let contributors or AI agents open PRs through the
              same x402 endpoint.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <a href={installUrl}>
                  Install on GitHub <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/create">Try contributor flow</Link>
              </Button>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Demo defaults</CardTitle>
              <CardDescription>Optimized for a hackathon Base Sepolia flow.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center gap-3"><GitPullRequest className="h-4 w-4" /> Public GitHub App install</div>
              <div className="flex items-center gap-3"><Wallet className="h-4 w-4" /> 0.05 USDC default price</div>
              <div className="flex items-center gap-3"><Bot className="h-4 w-4" /> Agent-compatible x402 endpoint</div>
            </CardContent>
          </Card>
        </section>
        <section className="grid gap-4 md:grid-cols-3">
          {[
            ["Install", "Repo owners install the GitHub App and choose repositories."],
            ["Configure", "Set price, recipient wallet, enabled state, and trusted wallets."],
            ["Create", "Contributors pay via x402 and the GitHub App opens the PR."],
          ].map(([title, description]) => (
            <Card key={title}>
              <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>
      </main>
    </div>
  );
}
