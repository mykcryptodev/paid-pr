import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { siteConfig } from "@/lib/seo";

export const alt = siteConfig.ogImageAlt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logo = await readFile(
    join(process.cwd(), "public/images/logo-512.png"),
  );
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(120% 120% at 0% 0%, #1c1c1c 0%, #0a0a0a 55%)",
          color: "#fafafa",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <img src={logoSrc} alt="" width={96} height={96} />
          <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>
            {siteConfig.name}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 84,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            <span>Stop the Slop.</span>
            <span>Open a real PR.</span>
          </div>
          <span
            style={{
              fontSize: 32,
              color: "#a1a1aa",
              maxWidth: 900,
              lineHeight: 1.3,
            }}
          >
            Gate external GitHub pull requests behind a USDC payment with x402.
          </span>
        </div>

        <span style={{ fontSize: 28, color: "#71717a" }}>paidpr.dev</span>
      </div>
    ),
    { ...size },
  );
}
