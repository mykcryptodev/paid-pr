import { createThirdwebClient, type ThirdwebClient } from "thirdweb";

const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID?.trim();

/**
 * Browser-safe thirdweb client. Only the public client id is used, so this is
 * safe to import into client components. Resolves to `null` when the client id
 * is unset, letting consumers degrade gracefully.
 */
export const thirdwebClient: ThirdwebClient | null = clientId
  ? createThirdwebClient({ clientId })
  : null;
