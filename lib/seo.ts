/**
 * Central SEO / site configuration.
 *
 * `url` is the canonical production origin. It can be overridden per
 * environment with NEXT_PUBLIC_APP_URL (e.g. preview deployments), but defaults
 * to the production domain so build-time metadata always resolves to absolute,
 * crawlable URLs.
 */
export const siteConfig = {
  name: "PaidPR",
  title: "PaidPR — Stop the Slop. Open a real PR.",
  slogan: "Stop the Slop. Open a real PR.",
  description:
    "PaidPR lets repo maintainers gate external GitHub pull requests behind a USDC payment. Contributors and AI agents pay through x402 before a PR is opened — so you stop the slop and only real PRs land in your inbox.",
  url:
    process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL !== ""
      ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
      : "https://paidpr.dev",
  ogImageAlt: "PaidPR — Stop the Slop. Open a real PR.",
  twitter: "@paidpr",
  keywords: [
    "PaidPR",
    "paid pull request",
    "x402",
    "GitHub pull request payment",
    "USDC payment",
    "gate pull requests",
    "stop AI slop",
    "AI slop PRs",
    "open source maintainer tools",
    "GitHub App",
    "pay to open PR",
    "Base USDC",
    "x402 payment",
  ],
} as const;

export const siteUrl = siteConfig.url;
