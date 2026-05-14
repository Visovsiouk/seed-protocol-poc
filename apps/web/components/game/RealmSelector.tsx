"use client";

/**
 * Preset/realm picker shown on the landing page.
 *
 *  swap: the realm list comes from `RealmRegistry.listRealms()`
 * with per-realm BossCleared/PlayerCount counts overlaid. For 2B we
 * hardcode the three starter realms (one per preset) since they aren't
 * deployed yet — the shape of the props is what 2C will populate.
 */

import Link from "next/link";
import type { Preset } from "@/lib/engine/types";

type RealmCard = {
  preset: Preset;
  name: string;
  tagline: string;
  /**: the deployed `EcosystemTemplate` address. */
  realm?: `0x${string}`;
};

const STARTERS: readonly RealmCard[] = [
  {
    preset: "fantasy",
    name: "The Hollow Reach",
    tagline:
      "Wet stone, oil-rust banners, and the Forest Hag's wet laughter from somewhere ahead.",
  },
  {
    preset: "scifi",
    name: "Drift Station Ker-7",
    tagline:
      "A dead colony ship adrift on a long elliptical. Something rebooted the core last cycle.",
  },
  {
    preset: "cyberpunk",
    name: "Black Ice District",
    tagline:
      "Neon over wet concrete. The ICE has names. The contract on your head has a quota.",
  },
];

function PresetBadge({ preset }: { preset: Preset }) {
  const label =
    preset === "fantasy" ? "Fantasy" : preset === "scifi" ? "Sci-Fi" : "Cyberpunk";
  return (
    <span
      className="inline-block text-[10px] uppercase tracking-widest px-2 py-0.5 rounded"
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      {label}
    </span>
  );
}

export function RealmSelector({ realms = STARTERS }: { realms?: readonly RealmCard[] }) {
  return (
    <section
      aria-label="Choose a realm"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 w-full max-w-5xl"
    >
      {realms.map((r) => (
        <Link
          key={r.preset}
          href={`/play/${r.preset}`}
          data-preset={r.preset}
          className="flex flex-col gap-3 p-5 rounded-md transition hover:scale-[1.02] focus:outline-none focus:ring"
          style={{
            background: "var(--color-preset-bg)",
            color: "var(--color-preset-fg)",
            border: "1px solid var(--color-preset-accent)",
          }}
        >
          <header className="flex items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold">{r.name}</h3>
            <PresetBadge preset={r.preset} />
          </header>
          <p className="text-sm opacity-80 leading-relaxed">{r.tagline}</p>
          <span
            className="mt-1 text-xs uppercase tracking-widest"
            style={{ color: "var(--color-preset-accent)" }}
          >
            Enter →
          </span>
        </Link>
      ))}
    </section>
  );
}
