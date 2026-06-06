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

- Enable GitHub login only (disable email and wallet in the Privy dashboard).
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

1. Visit `/create?repo=owner/repo`.
2. Enter PR title, body, head branch, and base branch.
3. Submit with an x402-capable client or use the returned 402 challenge.

Agent/CLI:

```bash
EVM_PRIVATE_KEY=0x... pnpm paidpr:create \
  --repo owner/repo \
  --head contributor:branch \
  --base main \
  --title "PaidPR demo"
```

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
