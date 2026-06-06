import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

function getArg(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const privateKey = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined;

if (!privateKey) {
  throw new Error("Set EVM_PRIVATE_KEY to a funded Base Sepolia private key.");
}

const repoFullName = getArg("repo");
const title = getArg("title", "PaidPR demo PR");
const body = getArg("body", "Opened through the PaidPR x402 CLI example.");
const head = getArg("head");
const base = getArg("base", "main");
const apiUrl = getArg(
  "api",
  `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/create-pr`,
) as string;

if (!repoFullName || !head) {
  throw new Error(
    "Usage: pnpm paidpr:create --repo owner/repo --head contributor:branch [--base main]",
  );
}

const account = privateKeyToAccount(privateKey);
const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [
    {
      network: (process.env.X402_NETWORK ??
        "eip155:84532") as `${string}:${string}`,
      client: new ExactEvmScheme(account),
    },
  ],
});

const response = await fetchWithPayment(apiUrl, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    repoFullName,
    title,
    body,
    head,
    base,
    payerAddress: account.address,
  }),
});

const payload = await response.json();

if (!response.ok) {
  console.error(payload);
  process.exit(1);
}

console.log(JSON.stringify(payload, null, 2));
