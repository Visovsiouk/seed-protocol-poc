"use client";

/**
 * The Colophon's weight, on the base's status strip.
 *
 * Part One's copy counted the book's thickness and had to hedge about a
 * threshold nobody could see. This is the other half of that sentence: how
 * much of him is left, as a number, next to how much has been written. The
 * plan's phrasing — the base counts the book's thickness *and* his remaining
 * weight — is the whole reason this sits here rather than only on
 * `/play/colophon`.
 *
 * It is also the **only** way into the raid from the UI. The page existed
 * with nothing linking to it, which on a demo server means it may as well
 * not have.
 *
 * Renders nothing at all before the first edition exists, so a chain that
 * has never opened one shows no stray chrome. A *sealed* gate still shows,
 * because "not yet, and here is how far" is the point of sealing it.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Chip } from "@/components/ui";

type RaidChipState = {
  ok: true;
  gate: { unlocked: boolean; remaining: number };
  boss: { edition: number; totalHp: number; currentHp: number; felled: boolean } | null;
};

export function ColophonChip() {
  const { data } = useQuery<RaidChipState>({
    queryKey: ["raid", "chip"],
    queryFn: async () => {
      const res = await fetch("/api/raid/state");
      const body = (await res.json()) as RaidChipState | { ok: false };
      if (!("ok" in body) || !body.ok) throw new Error("raid state failed");
      return body;
    },
    // Slower than the fight page's 5s: this is ambient status on a screen
    // nobody is fighting from, so it should not poll like a health bar.
    refetchInterval: 30_000,
    staleTime: 15_000,
    // A base that errors because the raid is unreachable would be worse
    // than one that quietly omits a chip.
    retry: false,
  });

  if (!data) return null;
  const { gate, boss } = data;
  if (!boss && gate.unlocked) return null;

  // Same `Chip` the Signet and Codex pills on this strip are built from. It
  // used to be a hand-rolled `border-white/15` lozenge sitting between two of
  // them — the one item on the row that didn't re-theme with the preset.
  // Felled reads as a win, so it borrows the Signet's colour; standing (and
  // sealed, which is a countdown rather than a loss) stays on the accent.
  return (
    <Link href="/play/colophon" className="opacity-80 transition-opacity hover:opacity-100">
      <Chip
        color={
          boss?.felled ? "var(--color-ok)" : "var(--color-preset-accent)"
        }
        label="The Colophon"
        sub={
          !gate.unlocked
            ? `sealed, ${gate.remaining} to go`
            : boss!.felled
              ? `edition ${boss!.edition} felled`
              : `${boss!.currentHp.toLocaleString()} left`
        }
      />
    </Link>
  );
}
