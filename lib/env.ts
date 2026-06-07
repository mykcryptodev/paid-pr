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

  // --- Token USD price oracle ---------------------------------------------
  // All keys are optional; each price provider degrades gracefully when its
  // credential is missing. DexScreener needs no key, CoinGecko and Thirdweb
  // work keyless (rate-limited) or with a key, and Chainlink needs an RPC URL.
  baseRpcUrl: optional("BASE_RPC_URL") ?? "https://mainnet.base.org",
  baseSepoliaRpcUrl:
    optional("BASE_SEPOLIA_RPC_URL") ?? "https://sepolia.base.org",
  coingeckoApiKey: optional("COINGECKO_API_KEY"),
  coingeckoProApiKey: optional("COINGECKO_PRO_API_KEY"),
  thirdwebSecretKey: optional("THIRDWEB_SECRET_KEY"),
  thirdwebClientId: optional("NEXT_PUBLIC_THIRDWEB_CLIENT_ID"),
};

