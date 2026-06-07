const optional = (key: string) => process.env[key]?.trim() || undefined;

const required = (key: string) => {
  const value = optional(key);

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

export const env = {
  appUrl: optional("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",
  githubAppName: optional("NEXT_PUBLIC_GITHUB_APP_NAME") ?? "paid-pr",
  githubAppId: () => required("GITHUB_APP_ID"),
  githubPrivateKey: () =>
    required("GITHUB_PRIVATE_KEY").replace(/\\n/g, "\n"),
  githubWebhookSecret: () => required("GITHUB_WEBHOOK_SECRET"),
  privyAppId: optional("NEXT_PUBLIC_PRIVY_APP_ID"),
  privyAppSecret: () => required("PRIVY_APP_SECRET"),
  databaseUrl: () => required("DATABASE_URL"),
  x402FacilitatorUrl:
    optional("X402_FACILITATOR_URL") ??
    "https://api.cdp.coinbase.com/platform/v2/x402",
  x402Network: optional("X402_NETWORK") ?? "eip155:8453",
  cdpApiKeyId: optional("CDP_API_KEY_ID"),
  cdpApiKeySecret: optional("CDP_API_KEY_SECRET"),
};
