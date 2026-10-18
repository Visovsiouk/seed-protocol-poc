"use client";

/**
 * AudioPanel — the volume popover in the CornerDock.
 *
 * Three sliders (master / music / SFX) plus a mute toggle. Mute is kept
 * separate from the volumes rather than implemented as "set master to
 * 0" so silencing is reversible without the player losing their levels.
 *
 * Changes apply live: `useAudio().setSettings` ramps the buses
 * immediately and persists to localStorage, so there's no Save button
 * and nothing to confirm.
 */

import type { ReactNode } from "react";
import { useAudio } from "@/lib/audio/AudioProvider";
import { Stamp } from "@/components/ui/Ledger";
import type { AudioSettings } from "@/lib/audio/settings";

/**
 * Small muted caption. Not `Ledger`'s `Footnote` — that one is
 * `self-end` by design (it's the "recovered page" attribution tag), and
 * right-aligning a slider's hint reads as a mistake.
 */
function Hint({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-55">
      {children}
    </span>
  );
}

type Row = {
  key: "master" | "music" | "sfx";
  label: string;
  hint: string;
};

const ROWS: readonly Row[] = [
  { key: "master", label: "Master", hint: "Everything" },
  { key: "music", label: "Music", hint: "Realm themes" },
  { key: "sfx", label: "Effects", hint: "Clicks and combat" },
] as const;

function Slider({
  row,
  value,
  disabled,
  onChange,
}: {
  row: Row;
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(value * 100);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-widest">
        <span style={{ color: "var(--color-preset-accent)" }}>{row.label}</span>
        <span className="tabular-nums opacity-60">{pct}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label={`${row.label} volume`}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--surface-2)] accent-[var(--color-preset-accent)] disabled:cursor-not-allowed disabled:opacity-40"
        style={{ accentColor: "var(--color-preset-accent)" }}
      />
      <Hint>{row.hint}</Hint>
    </label>
  );
}

export function AudioPanel() {
  const { settings, setSettings, supported, unlocked } = useAudio();

  return (
    <div className="flex flex-col gap-4">
      <Stamp>Sound</Stamp>

      {!supported ? (
        <Hint>
          This browser doesn&apos;t support the Web Audio API, so sound is
          unavailable.
        </Hint>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {ROWS.map((row) => (
              <Slider
                key={row.key}
                row={row}
                value={settings[row.key]}
                disabled={settings.muted}
                onChange={(v) =>
                  setSettings({ [row.key]: v } as Partial<AudioSettings>)
                }
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setSettings({ muted: !settings.muted })}
            aria-pressed={settings.muted}
            className="rounded-md border border-dashed border-[var(--border-2)] px-3 py-2 font-mono text-xs uppercase tracking-[0.18em] transition-colors hover:bg-[color-mix(in_oklab,var(--color-preset-accent)_10%,transparent)]"
            style={{ color: "var(--color-preset-accent)" }}
          >
            {settings.muted ? "Unmute" : "Mute all"}
          </button>

          {/* Browsers block audio until the page has been interacted with.
              Until that happens the sliders are still meaningful (they're
              applied the moment sound starts), so explain rather than
              disable. */}
          {!unlocked && (
            <Hint>Sound starts after your first click — browsers require it.</Hint>
          )}
        </>
      )}
    </div>
  );
}
