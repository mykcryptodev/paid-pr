"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";
import { ThirdwebProvider } from "thirdweb/react";

export function Providers({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  // ThirdwebProvider supplies the QueryClient that thirdweb's prebuilt Account
  // components (payer avatar/name in payment history) rely on, so it wraps
  // everything — including the no-Privy fallback path.
  if (!appId) {
    return <ThirdwebProvider>{children}</ThirdwebProvider>;
  }

  return (
    <ThirdwebProvider>
      <PrivyProvider
        appId={appId}
        config={{
          appearance: {
            theme: "dark",
            accentColor: "#fafafa",
            logo: "/images/logo-icon.png",
          },
          loginMethods: ["github", "wallet"],
          embeddedWallets: {
            ethereum: {
              createOnLogin: "users-without-wallets",
            },
          },
        }}
      >
        {children}
      </PrivyProvider>
    </ThirdwebProvider>
  );
}
