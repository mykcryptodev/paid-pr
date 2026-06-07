/**
 * Quick-pick payment tokens with their well-known Chainlink USD aggregators on
 * Base mainnet. Selecting one fills the payment token and its feed override in
 * the maintainer dashboard so common non-USDC tokens are a single click.
 *
 * Addresses are intentionally lowercased; the server re-resolves token
 * metadata on-chain and the config validator re-checksums them on save.
 */
export type FeedPreset = {
  /** Short label shown on the quick-pick button. */
  label: string;
  /** ERC-20 payment token address on Base mainnet. */
  tokenAddress: string;
  /** Display symbol (the server still confirms this on-chain). */
  symbol: string;
  /** Chainlink USD aggregator address for this token, or null for USDC. */
  feed: string | null;
};

export const FEED_PRESETS: FeedPreset[] = [
  {
    label: "USDC",
    tokenAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    symbol: "USDC",
    // USDC ≈ $1 and is the x402 default asset; no feed override needed.
    feed: null,
  },
  {
    label: "ETH",
    // Wrapped ETH (WETH) predeploy on Base.
    tokenAddress: "0x4200000000000000000000000000000000000006",
    symbol: "WETH",
    // ETH / USD
    feed: "0x71041dddad3595f9ced3dccfbe3d1f4b0a16bb70",
  },
  {
    label: "cbBTC",
    tokenAddress: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
    symbol: "cbBTC",
    // cbBTC / USD
    feed: "0x07da0e54543a844a80abe69c8a12f22b3aa59f9d",
  },
  {
    label: "EUR",
    // Circle's EURC on Base.
    tokenAddress: "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42",
    symbol: "EURC",
    // EUR / USD
    feed: "0xc91d87e81fab8f93699ecf7ee9b44d11e1d53f0f",
  },
];
