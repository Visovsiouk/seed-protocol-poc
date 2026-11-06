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

  const label = !gate.unlocked
    ? `The Colophon · sealed, ${gate.remaining} to go`
    : boss!.felled
      ? `The Colophon · edition ${boss!.edition} felled`
      : `The Colophon · ${boss!.currentHp.toLocaleString()} left`;

  return (
    <Link
      href="/play/colophon"
      className="rounded-full border border-white/15 px-2.5 py-1 tabular-nums opacity-70 transition hover:opacity-100"
    >
      {label}
    </Link>
  );
}
