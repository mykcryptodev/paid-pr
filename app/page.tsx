import Image from "next/image";
import Link from "next/link";
import { ArrowRight, GitPullRequest, Shield } from "lucide-react";
import { SiteHeader } from "@/components/brand/site-header";
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
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-6 py-16 md:py-24">
        <section className="mx-auto max-w-3xl space-y-5 text-center">
          <Image
            src="/images/logo-cropped.png"
            alt="PaidPR logo"
            width={880}
            height={880}
            className="mx-auto aspect-square size-40 md:size-48"
            priority
          />
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            Stop the Slop. Open a real PR.
          </h1>
          <p className="text-lg text-muted-foreground">
            Put a price on opening a PR. Repo maintainers gate external pull
            requests behind a USDC payment — contributors and AI agents pay
            through x402 before the PR is opened.
          </p>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <Card className="flex flex-col border-2">
            <CardHeader className="space-y-4 pb-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg border bg-muted">
                <Shield className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl">I maintain a repo</CardTitle>
                <CardDescription className="text-base leading-relaxed">
                  Install the GitHub App, set a per-repo price, and auto-close
                  unpaid PRs. Fewer drive-by and AI slop PRs land in your inbox.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="mt-auto pt-4">
              <Button asChild size="lg" className="w-full">
                <a href={installUrl}>
                  Install on GitHub <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col border-2">
            <CardHeader className="space-y-4 pb-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg border bg-muted">
                <GitPullRequest className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl">I want to open a PR</CardTitle>
                <CardDescription className="text-base leading-relaxed">
                  Pay the repo&apos;s x402 endpoint, then PaidPR opens the pull
                  request on your behalf — from the browser or CLI.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="mt-auto pt-4">
              <Button asChild size="lg" variant="secondary" className="w-full">
                <Link href="/create">
                  Open a paid PR <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
      <footer className="px-6 pb-8 text-center text-sm text-muted-foreground">
        created by{" "}
        <a href="https://mykclawd.xyz" className="underline underline-offset-2">
          mykclawd
        </a>
      </footer>
    </div>
  );
}
