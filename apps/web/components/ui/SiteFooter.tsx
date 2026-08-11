import Link from "next/link";

/**
 * One-line site footer rendered by AppShell on every route. Static (not
 * fixed) so it never fights the CornerDock pills for the viewport's bottom
 * edge; the extra bottom padding is only added when the fixed demo banner
 * is on, which would otherwise cover this line. Colours ride the active
 * preset's CSS tokens like the rest of the chrome.
 */

const GITHUB_URL = "https://github.com/Visovsiouk/seed-protocol-poc";
const WHITEPAPER_URL =
  "https://github.com/Visovsiouk/seed-protocol/blob/main/docs/The_Seed_Protocol_WhitePaper_v1.0.pdf";

const LINK_CLASS =
  "opacity-50 transition-opacity hover:underline hover:opacity-100";

export function SiteFooter() {
  const bannerOn = process.env.NEXT_PUBLIC_DEMO_BANNER === "true";
  return (
    <footer
      className={`border-t border-[var(--border-1)] px-6 pt-4 ${bannerOn ? "pb-10" : "pb-4"}`}
    >
      <p className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 font-mono text-xs uppercase tracking-widest">
        <Link href="/about" className={LINK_CLASS}>
          About &amp; credits
        </Link>
        <span aria-hidden className="opacity-30">
          ·
        </span>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASS}
        >
          GitHub
        </a>
        <span aria-hidden className="opacity-30">
          ·
        </span>
        <a
          href={WHITEPAPER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASS}
        >
          White paper
        </a>
      </p>
    </footer>
  );
}
