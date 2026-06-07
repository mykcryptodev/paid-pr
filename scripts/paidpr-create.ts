#!/usr/bin/env -S node --import tsx

import { readFile } from "node:fs/promises";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import {
  ExactEvmScheme,
  createPermit2ApprovalTx,
  getPermit2AllowanceReadParams,
} from "@x402/evm/exact/client";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Chain,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

const DEFAULT_APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function chainAndRpc(
  network: string,
): { chain: Chain; rpc: string } | null {
  switch (network) {
    case "eip155:8453":
      return {
        chain: base,
        rpc: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
      };
    case "eip155:84532":
      return {
        chain: baseSepolia,
        rpc: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
      };
    default:
      return null;
  }
}

/**
 * Permit2-settled tokens need a one-time on-chain approval before the signed
 * payment can settle. Preflight the API to read the payment requirements, and
 * if it asks for Permit2, approve the token from the payer key when the
 * allowance is missing. EIP-3009 tokens (USDC) need none of this.
 *
 * Best-effort: any failure here is logged and we fall through to the normal
 * payment attempt, which surfaces the underlying error.
 */
async function ensurePermit2Approval(opts: {
  apiUrl: string;
  headers: Record<string, string>;
  body: string;
  account: PrivateKeyAccount;
}) {
  const preflight = await fetch(opts.apiUrl, {
    method: "POST",
    headers: opts.headers,
    body: opts.body,
  });

  // Only a 402 carries payment requirements; anything else is handled by the
  // real request below.
  if (preflight.status !== 402) {
    return;
  }

  const required = (await preflight.json().catch(() => null)) as {
    accepts?: Array<{
      network?: string;
      asset?: string;
      amount?: string;
      maxAmountRequired?: string;
      extra?: { assetTransferMethod?: string };
    }>;
  } | null;

  const requirement = required?.accepts?.[0];
  if (!requirement || requirement.extra?.assetTransferMethod !== "permit2") {
    return;
  }

  const asset = requirement.asset as `0x${string}` | undefined;
  const network = requirement.network;
  if (!asset || !network) {
    return;
  }

  const target = chainAndRpc(network);
  if (!target) {
    return;
  }

  const requiredAtomic = BigInt(
    requirement.amount ?? requirement.maxAmountRequired ?? "0",
  );
  const publicClient = createPublicClient({
    chain: target.chain,
    transport: http(target.rpc),
  });
  const allowanceParams = getPermit2AllowanceReadParams({
    tokenAddress: asset,
    ownerAddress: opts.account.address,
  });
  const allowance = (await publicClient.readContract(
    allowanceParams,
  )) as bigint;

  if (allowance >= requiredAtomic) {
    return;
  }

  console.error(`Approving ${asset} for Permit2 (one-time)...`);
  const walletClient = createWalletClient({
    account: opts.account,
    chain: target.chain,
    transport: http(target.rpc),
  });
  const approval = createPermit2ApprovalTx(asset);
  const hash = await walletClient.sendTransaction({
    account: opts.account,
    chain: target.chain,
    to: approval.to,
    data: approval.data,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  console.error(`Permit2 approval confirmed: ${hash}`);
}

type CliOptions = {
  apiUrl: string;
  base: string;
  body: string;
  draft: boolean;
  githubToken?: string;
  head?: string;
  labels: string[];
  maintainerCanModify: boolean;
  privateKey?: `0x${string}`;
  repoFullName?: string;
  title: string;
};

function usage() {
  return `Usage:
  paidpr open --repo owner/repo --head contributor:branch --title "PR title" [options]
  pnpm paidpr:create --repo owner/repo --head contributor:branch --title "PR title" [options]

Options:
  --api <url>                       PaidPR create endpoint. Defaults to NEXT_PUBLIC_APP_URL/api/create-pr.
  --repo <owner/repo>               Target repository with the GitHub App installed.
  --head <branch|owner:branch>      Source branch ref for the pull request.
  --base <branch>                   Base branch. Defaults to main.
  --title <title>                   Pull request title.
  --body <body>                     Pull request body.
  --body-file <path>                Read the pull request body from a file.
  --label <label>                   Add a label. Can be repeated.
  --labels <labels>                 Comma or newline separated labels.
  --draft                           Open the pull request as a draft.
  --github-token <token>             GitHub user OAuth/PAT token. Defaults to GITHUB_TOKEN.
  --no-maintainer-can-modify        Disable maintainer edits on the source branch.
  --private-key <0x...>             EVM private key. Defaults to EVM_PRIVATE_KEY.
  --help                            Show this help message.
`;
}

function readValue(args: string[], index: number, flag: string) {
  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }

  return value;
}

function splitLabels(value: string) {
  return value
    .split(/[\n,]/)
    .map((label) => label.trim())
    .filter(Boolean);
}

function parseArgs(argv: string[]) {
  const args = [...argv];
  const command = args[0] && !args[0].startsWith("--") ? args.shift() : "open";
  const options: CliOptions & { bodyFile?: string; help?: boolean } = {
    apiUrl: `${DEFAULT_APP_URL}/api/create-pr`,
    base: "main",
    body: "",
    draft: false,
    githubToken: process.env.GITHUB_TOKEN,
    labels: [],
    maintainerCanModify: true,
    privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined,
    title: "",
  };

  if (command !== "open" && command !== "create" && command !== "help") {
    throw new Error(`Unknown command "${command}".`);
  }

  if (command === "help") {
    options.help = true;
    return options;
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const equalIndex = arg.indexOf("=");
    const flag = equalIndex >= 0 ? arg.slice(0, equalIndex) : arg;
    const inlineValue = equalIndex >= 0 ? arg.slice(equalIndex + 1) : undefined;
    const getFlagValue = () => {
      const value = inlineValue ?? readValue(args, index, flag);

      if (!inlineValue) {
        index += 1;
      }

      return value;
    };

    switch (flag) {
      case "--api":
        options.apiUrl = getFlagValue();
        break;
      case "--base":
        options.base = getFlagValue();
        break;
      case "--body":
        options.body = getFlagValue();
        break;
      case "--body-file":
        options.bodyFile = getFlagValue();
        break;
      case "--draft":
        options.draft = true;
        break;
      case "--head":
        options.head = getFlagValue();
        break;
      case "--github-token":
        options.githubToken = getFlagValue();
        break;
      case "--help":
        options.help = true;
        break;
      case "--label":
        options.labels.push(getFlagValue());
        break;
      case "--labels":
        options.labels.push(...splitLabels(getFlagValue()));
        break;
      case "--maintainer-can-modify":
        options.maintainerCanModify = true;
        break;
      case "--no-maintainer-can-modify":
        options.maintainerCanModify = false;
        break;
      case "--private-key":
        options.privateKey = getFlagValue() as `0x${string}`;
        break;
      case "--repo":
        options.repoFullName = getFlagValue();
        break;
      case "--title":
        options.title = getFlagValue();
        break;
      default:
        throw new Error(`Unknown option "${flag}".`);
    }
  }

  return options;
}

function assertRequired(
  options: CliOptions,
): asserts options is CliOptions & {
  head: string;
  githubToken: string;
  privateKey: `0x${string}`;
  repoFullName: string;
} {
  if (!options.privateKey) {
    throw new Error("Set EVM_PRIVATE_KEY or pass --private-key with a funded x402 wallet.");
  }

  if (!options.githubToken) {
    throw new Error(
      "Set GITHUB_TOKEN or pass --github-token so GitHub creates the PR as your user.",
    );
  }

  if (!options.privateKey.startsWith("0x")) {
    throw new Error("Private key must be a 0x-prefixed EVM private key.");
  }

  if (!options.repoFullName) {
    throw new Error("Pass --repo owner/repo.");
  }

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repoFullName)) {
    throw new Error("Repository must use owner/repo format.");
  }

  if (!options.head) {
    throw new Error("Pass --head branch or --head owner:branch.");
  }

  if (!options.title.trim()) {
    throw new Error("Pass --title with a pull request title.");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(usage());
    return;
  }

  if (options.bodyFile) {
    options.body = await readFile(options.bodyFile, "utf8");
  }

  assertRequired(options);

  const account = privateKeyToAccount(options.privateKey);
  const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [
      {
        network: (process.env.X402_NETWORK ??
          "eip155:8453") as `${string}:${string}`,
        client: new ExactEvmScheme(account),
      },
    ],
  });

  const requestHeaders = {
    "content-type": "application/json",
    "github-oauth-token": options.githubToken as string,
  };
  const requestBody = JSON.stringify({
    repoFullName: options.repoFullName,
    title: options.title,
    body: options.body,
    head: options.head,
    base: options.base,
    labels: options.labels,
    draft: options.draft,
    maintainerCanModify: options.maintainerCanModify,
    payerAddress: account.address,
  });

  try {
    await ensurePermit2Approval({
      apiUrl: options.apiUrl,
      headers: requestHeaders,
      body: requestBody,
      account,
    });
  } catch (error) {
    console.error(
      "Permit2 pre-approval step failed; attempting payment anyway:",
      error instanceof Error ? error.message : error,
    );
  }

  const response = await fetchWithPayment(options.apiUrl, {
    method: "POST",
    headers: requestHeaders,
    body: requestBody,
  });

  const payload = await response.json().catch(async () => ({
    error: await response.text(),
  }));

  if (!response.ok) {
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  console.error();
  console.error(usage());
  process.exit(1);
});
