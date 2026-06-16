import type { Metadata } from "next";
import {
  Space_Grotesk,
  Inter,
  IBM_Plex_Mono,
  VT323,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

/**
 * Three-voice type scale, self-hosted via next/font:
 *   display / stamps  → Space Grotesk (tight grotesk for titles + eyebrows)
 *   body / narrative  → Inter (readable sans for UI prose)
 *   data / numbers    → IBM Plex Mono (tabular figures for HP/ETH/stats)
 *
 * Each exposes a CSS variable consumed by the `--font-*` tokens in
 * globals.css, which keep system-stack fallbacks so the UI still renders
 * if a face is unavailable.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});
// CRT terminal voices (play routes only, via [data-theme="crt"] in
// globals.css): VT323 is the chunky pixel display face for titles/big
// numbers; JetBrains Mono carries body + data in a clean terminal mono.
const vt323 = VT323({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-vt323",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

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
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${plexMono.variable} ${vt323.variable} ${jetbrainsMono.variable}`}
    >
      {/* Default to the entry world (fantasy) palette so the chrome —
          nav, wallet, landing — reads in-world from first paint instead of
          the off-brand protocol violet. Play/dashboard routes override this
          via `useRealmTheme` and restore it on exit. */}
      <body data-preset="fantasy">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
