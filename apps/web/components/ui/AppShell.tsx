"use client";

/**
 * AppShell.
 *
 * One shared chrome for every route, replacing the five hand-rolled
 * per-page headers. Provides:
 *   a skip-to-content link (a11y)
 *   the ambient-orb background layer
 *   - a persistent slim top bar: left = back/home affordance, centre =
 *     contextual title, right = gated nav + per-page actions + ConnectButton
 *   - the post-3-clears gating that used to live in ProtocolSurfaceGate,
 *     so Bazaar/Create appear in the nav consistently everywhere
 *
 * The bar reads the active `[data-preset]` (set on <body> by each route)
 * purely through CSS tokens, so its accent matches the current realm with
 * no per-preset code here.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import type { ReactNode } from "react";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { useTutorialProgress } from "@/lib/reads/hooks";
import { emptyTutorialProgress } from "@/lib/tutorial/progress";
import { AmbientOrbs } from "./AmbientOrbs";

type Props = {
  children: ReactNode;
  /** Centre title. Omit on routes that reveal their own title (landing). */
  title?: ReactNode;
  /** Back affordance. Defaults to Home; pass `null` to hide entirely. */
  back?: { href: string; label: string } | null;
  /** Page-specific actions (Inventory, List, …) shown left of ConnectButton. */
  actions?: ReactNode;
  /** Constrain the main column width. Defaults to the 6xl rhythm. */
  width?: "default" | "wide" | "full";
};

const WIDTH: Record<NonNullable<Props["width"]>, string> = {
  default: "max-w-6xl",
  wide: "max-w-7xl",
  full: "max-w-none",
};

const NAV = [
  { href: "/genesis", label: "Genesis" },
  { href: "/bazaar", label: "Bazaar" },
  { href: "/create", label: "Create" },
] as const;

export function AppShell({ children, title, back, actions, width = "default" }: Props) {
  const pathname = usePathname();
  const { address } = useAccount();
  const progress = useTutorialProgress(address).data ?? emptyTutorialProgress();
  const arcCompleted = progress.starterClears >= 3 || progress.hasSeed;

  const backLink = back === undefined ? { href: "/", label: "← Home" } : back;
  const widthClass = WIDTH[width];

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-[var(--color-preset-accent)] focus:px-3 focus:py-2 focus:text-[var(--color-preset-bg)]"
      >
        Skip to content
      </a>

      <AmbientOrbs />

      <header className="sticky top-0 z-30 border-b border-[var(--border-1)] bg-[color-mix(in_oklab,var(--color-preset-bg)_82%,transparent)] backdrop-blur">
        <div className={`mx-auto flex items-center justify-between gap-4 px-6 py-3 ${widthClass}`}>
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {backLink && (
              <Link
                href={backLink.href}
                className="shrink-0 text-sm opacity-70 transition-opacity hover:opacity-100"
              >
                {backLink.label}
              </Link>
            )}
            {arcCompleted && (
              <nav className="flex items-center gap-3" aria-label="Protocol surfaces">
                {NAV.map((n) => {
                  const active = pathname.startsWith(n.href);
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      aria-current={active ? "page" : undefined}
                      className="text-sm transition-opacity"
                      style={{
                        opacity: active ? 1 : 0.6,
                        color: active ? "var(--color-preset-accent)" : undefined,
                      }}
                    >
                      {n.label}
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>

          {title != null && (
            <h1 className="truncate text-center text-lg font-semibold tracking-tight font-[family-name:var(--font-display)]">
              {title}
            </h1>
          )}

          <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
            {actions}
            <ConnectButton />
          </div>
        </div>
      </header>

      <main id="main" className="min-h-screen px-6 py-10">
        <div className={`mx-auto ${widthClass}`}>{children}</div>
      </main>
    </>
  );
}
