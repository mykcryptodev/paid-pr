import { createFacilitatorConfig } from "@coinbase/x402";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { env } from "@/lib/env";

let server: x402ResourceServer | null = null;

export function getX402Server() {
  if (!server) {
    const facilitatorConfig =
      env.cdpApiKeyId && env.cdpApiKeySecret
        ? createFacilitatorConfig(env.cdpApiKeyId, env.cdpApiKeySecret)
        : { url: env.x402FacilitatorUrl };

    const facilitator = new HTTPFacilitatorClient(facilitatorConfig);
    server = new x402ResourceServer(facilitator).register(
      env.x402Network as `${string}:${string}`,
      new ExactEvmScheme(),
    );
  }

  return server;
}
