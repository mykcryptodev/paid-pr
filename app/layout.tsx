import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "./providers";
import "./globals.css";

const segment = localFont({
  src: [
    {
      path: "../public/fonts/Segment/Segment-Medium.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/Segment/Segment-Bold.otf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-segment",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PaidPR",
  description: "Self-serve x402-gated GitHub pull request creation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${segment.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
