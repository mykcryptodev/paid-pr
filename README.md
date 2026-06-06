# PaidPR

Self-serve x402-gated GitHub pull request creation. Repo owners install one
GitHub App, configure a per-repo USDC price and recipient wallet, and
contributors or agents open PRs through the same paid endpoint. Deter PR slop with x402.

## Getting Started

Install dependencies and copy the env template:

```bash
pnpm install
cp .env.example .env.local
```

Provision a Vercel-managed Neon database or any Postgres database, then set
`DATABASE_URL` in `.env.local`.

```bash
pnpm db:generate
pnpm db:push
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Required Services

GitHub App:

- Callback URL: `https://paidpr.dev/api/github/callback`
- Webhook URL: `https://paidpr.dev/api/webhook`
- Permissions: contents read/write, pull requests read/write, metadata read
- Events: `installation`, `installation_repositories`, `pull_request`
- Env: `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`,
  `NEXT_PUBLIC_GITHUB_APP_NAME`

Privy:

- Enable GitHub and wallet login. Maintainers use GitHub for repository
  management, while contributors connect an EVM wallet for x402 payments.
- Configure GitHub OAuth to request the classic `repo` scope; GitHub requires it
  when creating PRs as contributors and when removing a selected repository
  from an app installation.
- Env: `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`

x402:

- Default network: Base Sepolia (`eip155:84532`)
- For testnet-only local demos, set `X402_FACILITATOR_URL=https://x402.org/facilitator`
- For Coinbase CDP facilitator, set `X402_FACILITATOR_URL`,
  `CDP_API_KEY_ID`, and `CDP_API_KEY_SECRET`

## Flows

Maintainer:

1. Visit `/` and click install.
2. Choose repositories in GitHub.
3. Return to `/dashboard`.
4. Connect Privy, set price, recipient wallet, enabled state, and trusted wallets.

Human contributor:

1. Visit `/create?repo=owner/repo`, optionally with `&branch=feature`,
   `&head=fork-owner:branch`, `&base=main`, or `&sourceRepo=owner/fork`.
2. Enter PR title and body, then select source and base branches from the
   dropdowns or keep the prefilled URL branch.
3. Connect GitHub and a funded EVM wallet, then pay the displayed x402 cost
   in-page. PaidPR opens the GitHub PR as your GitHub user after the payment
   verifies.

Agent/CLI:

```bash
GITHUB_TOKEN=ghp_... EVM_PRIVATE_KEY=0x... pnpm paidpr open \
  --repo owner/repo \
  --head contributor:branch \
  --base main \
  --title "PaidPR demo"
```

The CLI pays the repository's configured x402 price and calls
`POST /api/create-pr` with a GitHub user token, so GitHub attributes the PR to
that user. It prints the API response as JSON, including the GitHub PR URL.

Useful flags:

```bash
pnpm paidpr open \
  --repo owner/repo \
  --head fork-owner:feature-branch \
  --base main \
  --title "Fix flaky parser" \
  --body-file ./PR_BODY.md \
  --github-token ghp_... \
  --label bug \
  --label agent-authored \
  --draft
```

Set `NEXT_PUBLIC_APP_URL` or pass `--api https://paidpr.dev/api/create-pr` when
calling a hosted PaidPR instance. `pnpm paidpr:create` remains available as a
backwards-compatible alias.

## Verification Checklist

- Install the GitHub App on at least two test repos.
- Confirm `repo_configs` rows are created by the installation webhook.
- Save a per-repo price and recipient wallet in `/dashboard`.
- Open a paid PR through `pnpm paidpr:create`.
- Open an unpaid PR directly on GitHub and confirm the webhook comments and closes it.

## Scripts

- `pnpm dev`: start local Next.js.
- `pnpm lint`: run ESLint.
- `pnpm typecheck`: run TypeScript.
- `pnpm build`: build the app.
- `pnpm db:generate`: generate Drizzle migrations.
- `pnpm db:push`: push schema to the configured database.
