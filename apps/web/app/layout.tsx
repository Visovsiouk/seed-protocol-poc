import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Realms — Seed Protocol PoC",
  description:
    "A deterministic, dice-driven text RPG demonstrating the Seed Protocol's universal asset, schema adoption, and provenance-bound royalties.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
