# PaidPR

Self-serve x402-gated GitHub pull request creation. Repo owners install one
GitHub App, configure a per-repo price and recipient wallet, and contributors or
agents open PRs through the same paid endpoint. Deter PR slop with x402.

Maintainers can charge in **any reliably-priced ERC-20 token on Base** — not
just USDC. Set the price in USD (converted to the token at payment time using a
multi-source price oracle) or as a fixed token amount.

## Demo

[![PaidPR demo](https://img.youtube.com/vi/wFzG4F0oL9A/maxresdefault.jpg)](https://youtu.be/wFzG4F0oL9A)

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

Payment tokens & price oracle:

- Any ERC-20 on the configured network can be set as a repo's payment token.
  The dashboard resolves the token's symbol, decimals, and EIP-712 domain
  on-chain, and previews its live USD price before you save.
- USD prices are reconciled across multiple independent sources so a single
  bad or stale feed cannot move the charged amount: **Chainlink** (on-chain),
  **CoinGecko**, **DexScreener**, and **Thirdweb**. Quotes are aggregated by
  median with outlier rejection, cached briefly, and served stale only as a
  last-resort fallback when every live source is down.
- The exact-EVM x402 scheme moves tokens via EIP-3009 (`transferWithAuthorization`,
  USDC-style) or Permit2 (`assetTransferMethod`). The CDP facilitator supports
  EIP-3009 for USDC/EURC and **Permit2 for any ERC-20**. Tokens whose EIP-712
  domain cannot be confirmed on-chain are flagged in the dashboard; use Permit2
  for those.
- Permit2 needs a one-time on-chain approval of the Permit2 contract per token,
  in addition to the per-payment signature. The web pay flow detects a missing
  approval and walks the payer through it (one extra wallet prompt the first
  time), and the CLI approves from the payer key automatically. EIP-3009 tokens
  (USDC) need no approval.
- Oracle env (all optional; each provider degrades gracefully):
  - `BASE_RPC_URL` / `BASE_SEPOLIA_RPC_URL` — RPC for Chainlink reads and token
    metadata resolution (a dedicated RPC is strongly recommended; the public
    default is heavily rate-limited).
  - `COINGECKO_API_KEY` (demo) or `COINGECKO_PRO_API_KEY` (pro).
  - `THIRDWEB_SECRET_KEY` or `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`.

## Flows

Maintainer:

1. Visit `/` and click install.
2. Choose repositories in GitHub.
3. Return to `/dashboard`.
4. Connect Privy, choose the payment token (or keep USDC), set the price in
   USD or token units, recipient wallet, enabled state, and trusted wallets.

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
