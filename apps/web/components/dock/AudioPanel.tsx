"use client";

/**
 * AudioPanel — the dock's sound popover.
 *
 * Part player, part mixer. The player half exists because music is off
 * by default: once it's a thing you opt into, there has to be somewhere
 * obvious to opt in, see that it worked, and see what's playing. A bare
 * volume slider gives no feedback when the answer to "why is it silent"
 * is "you never turned it on".
 *
 * The track name is read from the audio clock rather than from React
 * state, because a realm change doesn't take effect until the next bar
 * line — the label would otherwise claim the new track up to a couple of
 * seconds before you could hear it.
 *
 * Changes apply live and persist to localStorage; there's no Save.
 */

import type { ReactNode } from "react";
import { useAudio } from "@/lib/audio/AudioProvider";
import { getTrack } from "@/lib/audio/manifest";
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

function PlayGlyph({ playing }: { playing: boolean }) {
  return (
    <svg
      aria-hidden
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="var(--color-preset-bg)"
    >
      {playing ? (
        <>
          <rect x="2" y="1.5" width="3" height="9" rx="0.5" />
          <rect x="7" y="1.5" width="3" height="9" rx="0.5" />
        </>
      ) : (
        <path d="M3 1.5 10.5 6 3 10.5z" />
      )}
    </svg>
  );
}

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
    <label className={`flex flex-col gap-1.5 ${disabled ? "opacity-45" : ""}`}>
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
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--surface-2)] disabled:cursor-not-allowed"
        style={{ accentColor: "var(--color-preset-accent)" }}
      />
      <Hint>{row.hint}</Hint>
    </label>
  );
}

export function AudioPanel() {
  const {
    settings,
    setSettings,
    setMusicEnabled,
    nowPlaying,
    supported,
    unlocked,
  } = useAudio();

  if (!supported) {
    return (
      <div className="flex flex-col gap-4">
        <Stamp>Sound</Stamp>
        <Hint>
          This browser doesn&apos;t support the Web Audio API, so sound is
          unavailable.
        </Hint>
      </div>
    );
  }

  const musicOn = settings.musicEnabled;
  const label = nowPlaying ? getTrack(nowPlaying).label : null;

  return (
    <div className="flex flex-col gap-4">
      <Stamp>Sound</Stamp>

      {/* Player */}
      <div className="flex items-center gap-3 rounded-lg border border-[var(--border-1)] bg-[var(--surface-1)] p-3">
        <button
          type="button"
          onClick={() => setMusicEnabled(!musicOn)}
          aria-pressed={musicOn}
          aria-label={musicOn ? "Turn music off" : "Turn music on"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-[filter] hover:brightness-110"
          style={{ background: "var(--color-preset-accent)" }}
        >
          <PlayGlyph playing={musicOn} />
        </button>
        <span className="flex min-w-0 flex-col">
          <span
            className="truncate font-mono text-xs uppercase tracking-widest"
            style={{ color: "var(--color-preset-accent)" }}
          >
            {musicOn ? label ?? "Loading…" : "Music off"}
          </span>
          <Hint>
            {musicOn
              ? label
                ? "Now playing"
                : "Fetching the track"
              : "Tap to start the score"}
          </Hint>
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {ROWS.map((row) => (
          <Slider
            key={row.key}
            row={row}
            value={settings[row.key]}
            // The music slider is meaningless while music is off, and
            // greying it points at the player above as the thing to use.
            disabled={settings.muted || (row.key === "music" && !musicOn)}
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
          Until that happens the sliders are still meaningful (they apply
          the moment sound starts), so explain rather than disable. */}
      {!unlocked && (
        <Hint>Sound starts after your first click — browsers require it.</Hint>
      )}
    </div>
  );
}
