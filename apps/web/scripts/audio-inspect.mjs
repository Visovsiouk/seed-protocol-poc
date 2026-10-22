#!/usr/bin/env node
/**
 * audio-inspect — convert music source files and work out their bar counts.
 *
 * `lib/audio/position.ts` derives every timing quantity from
 * `loopDuration / bars`, so the bar count is the one number we have to be
 * told. It can't be measured from the audio: a 32-bar loop at 120 BPM and
 * a 16-bar loop at 60 BPM are the same number of seconds.
 *
 * What *can* be done is invert the question. For each candidate bar count
 * this prints the BPM it would imply; exactly one row per track will look
 * like real music. Pick it, and put that bar count in
 * `lib/audio/manifest.ts`.
 *
 * Usage:
 *   node scripts/audio-inspect.mjs <dir-or-file>...   # convert + measure
 *   node scripts/audio-inspect.mjs --inspect-only     # measure public/audio/music
 *   node scripts/audio-inspect.mjs --placeholders     # write metronome stand-ins
 *
 * `--placeholders` writes four click tracks at known tempos and bar
 * counts, each on its own pitch with an accent on beat 1. They're for
 * exercising the hand-off before the real music exists: because you can
 * hear the downbeat, a switch that lands off-grid is obvious. Delete them
 * (or just overwrite) when the real files arrive.
 *
 * Conversion targets Opus-in-WebM because it preserves exact sample
 * counts. MP3 and AAC pad the stream, which inflates the decoded duration
 * and skews the bar grid — see the manifest's header for why that matters.
 *
 * Requires ffmpeg and ffprobe on PATH.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

const run = promisify(execFile);

const MUSIC_DIR = resolve(import.meta.dirname, "..", "public", "audio", "music");

/** Bar counts worth testing — the conventional loop lengths. */
const CANDIDATE_BARS = [8, 16, 24, 32, 48, 64, 96, 128];
/** A bar count is only plausible if it implies a tempo in this range. */
const PLAUSIBLE_BPM = { min: 60, max: 190 };
const BEATS_PER_BAR = 4;

const SOURCE_EXTS = new Set([
  ".wav",
  ".flac",
  ".aiff",
  ".aif",
  ".mp3",
  ".m4a",
  ".aac",
  ".ogg",
  ".opus",
  ".webm",
]);

/**
 * Track id inferred from a filename. The ids come from `TrackId` in the
 * manifest; the aliases are the words a composer is likely to have used.
 */
const ID_ALIASES = {
  theme: ["theme", "menu", "title", "main"],
  fantasy: ["fantasy", "medieval", "fantasia"],
  cyberpunk: ["cyberpunk", "cyber", "neon", "punk"],
  scifi: ["scifi", "sci-fi", "space", "sci_fi"],
};

function inferId(filename) {
  const stem = basename(filename, extname(filename)).toLowerCase();
  for (const [id, aliases] of Object.entries(ID_ALIASES)) {
    if (aliases.some((a) => stem.includes(a))) return id;
  }
  return null;
}

async function requireTool(name) {
  try {
    await run(name, ["-version"]);
  } catch {
    console.error(
      `error: ${name} not found on PATH. Install ffmpeg (which ships ffprobe) and retry.`,
    );
    process.exit(1);
  }
}

/** Exact duration in seconds, read from the decoded stream. */
async function probeDuration(file) {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds)) throw new Error(`could not probe ${file}`);
  return seconds;
}

/**
 * Opus bitrate for the music beds. 96k stereo is at or near transparent
 * for music, and these play under gameplay at ~35% volume — 128k was
 * spending ~25% more bytes on headroom nobody can hear. Four full-length
 * tracks is the single biggest thing this app downloads, so the knob
 * matters; 64k is still decent if you need to halve it again.
 */
const OPUS_BITRATE = "96k";

async function toOpus(input, outPath) {
  await run("ffmpeg", [
    "-y",
    "-i",
    input,
    "-c:a",
    "libopus",
    "-b:a",
    OPUS_BITRATE,
    "-vbr",
    "on",
    "-application",
    "audio",
    "-map_metadata",
    "-1",
    outPath,
  ]);
}

/**
 * Loop preparation specs — measured from the source tracks.
 *
 * `--prepare-loops` turns a full song into a loop-ready asset: it trims
 * to a whole number of bars starting at the first downbeat, then
 * crossfades the material *after* the loop end back over the head. The
 * result loops seamlessly under plain Web Audio looping, so the runtime
 * needs no seam handling at all — the file simply joins to itself.
 *
 * `bpm` is the one value worth revisiting by ear. It was measured by
 * autocorrelating an onset envelope over the whole track; the confidence
 * note records how sharp that peak was. If a genre switch ever lands
 * slightly off the beat late in a track, nudging the bpm here is the fix.
 *
 * `offset` is where beat 1 falls, and `bars` is chosen to end before the
 * track's fade-out so the loop wraps at full level rather than through
 * the outro — the outro is what gets used as the crossfade tail.
 */
const LOOP_SPECS = [
  {
    id: "theme",
    source: "menu.mp3",
    // No steady pulse in this one (it's ambient) — 120 is a nominal grid
    // so the shared bar clock still has something to count. Switching
    // *out* of it can't be beat-locked to anything audible, which is
    // fine: what matters is the incoming track landing on its own
    // downbeat.
    bpm: 120,
    confidence: "none (ambient, no detectable beat)",
    offset: 0,
    bars: 89,
  },
  {
    id: "fantasy",
    source: "medieval.mp3",
    bpm: 120.19,
    confidence: "high (sharp autocorrelation peak)",
    offset: 0.449,
    bars: 96,
  },
  {
    id: "cyberpunk",
    source: "cyberpunk.mp3",
    bpm: 120.1,
    confidence: "medium (peak spans 120.0-120.2)",
    offset: 0.2122,
    bars: 103,
  },
  {
    id: "scifi",
    source: "space.mp3",
    bpm: 121.6,
    confidence: "low (broad peak, 121.6-122.1)",
    offset: 0.101,
    bars: 108,
  },
];

/** Seam crossfade length, ~1 bar. Long enough to hide a loop joint. */
const LOOP_CROSSFADE = 2.0;
const SOURCE_DIR = resolve(import.meta.dirname, "..", "assets-src", "audio");

async function prepareLoops() {
  await requireTool("ffmpeg");
  mkdirSync(MUSIC_DIR, { recursive: true });
  const results = [];

  for (const spec of LOOP_SPECS) {
    const { id, source, bpm, offset, bars } = spec;
    const input = join(SOURCE_DIR, source);
    if (!existsSync(input)) {
      console.error(`error: ${input} not found — put the source files there.`);
      process.exit(1);
    }
    const barSec = (BEATS_PER_BAR * 60) / bpm;
    const loopLen = bars * barSec;
    const C = LOOP_CROSSFADE;
    const need = offset + loopLen + C;
    const have = await probeDuration(input);
    if (need > have) {
      console.error(
        `error: ${id} needs ${need.toFixed(2)}s but ${source} is only ${have.toFixed(2)}s. ` +
          `Reduce bars.`,
      );
      process.exit(1);
    }

    // head = [0,C)  body = [C,loopLen)  tail = [loopLen, loopLen+C)
    // out  = (head*fadeIn + tail*fadeOut) ++ body     -- exactly loopLen long
    //
    // Looping that joins body's end to the blended head, and because the
    // tail is the audio that naturally followed body's end, the join is
    // continuous. qsin curves keep power constant across the blend
    // (the two sides are uncorrelated, so linear fades would dip).
    const f = [
      `[0:a]atrim=start=${offset}:duration=${loopLen + C},asetpts=PTS-STARTPTS[s]`,
      `[s]asplit=3[s1][s2][s3]`,
      `[s1]atrim=0:${C},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${C}:curve=qsin[head]`,
      `[s2]atrim=${C}:${loopLen},asetpts=PTS-STARTPTS[body]`,
      `[s3]atrim=${loopLen}:${loopLen + C},asetpts=PTS-STARTPTS,afade=t=out:st=0:d=${C}:curve=qsin[tail]`,
      `[head][tail]amix=inputs=2:normalize=0[blend]`,
      `[blend][body]concat=n=2:v=0:a=1[out]`,
    ].join(";");

    const out = join(MUSIC_DIR, `${id}.webm`);
    console.log(
      `${id.padEnd(10)} <- ${source.padEnd(15)} ${bars} bars @ ${bpm} BPM = ${loopLen.toFixed(3)}s`,
    );
    await run("ffmpeg", [
      "-y",
      "-i",
      input,
      "-filter_complex",
      f,
      "-map",
      "[out]",
      "-c:a",
      "libopus",
      "-b:a",
      OPUS_BITRATE,
      "-vbr",
      "on",
      "-application",
      "audio",
      "-map_metadata",
      "-1",
      out,
    ]);
    results.push({ ...spec, barSec, loopLen, out });
  }

  console.log("\n--- paste into lib/audio/manifest.ts ---");
  for (const r of results) {
    console.log(
      `  { id: "${r.id}", src: "/audio/music/${r.id}.webm", bars: ${r.bars}, ` +
        `loopEndSeconds: ${r.loopLen.toFixed(6)}, label: "..." },  // ${r.bpm} BPM`,
    );
  }
  return results.map((r) => r.out);
}

/**
 * Metronome stand-ins. Tempos are chosen so that 32 bars of 4/4 comes to
 * a whole number of seconds, which keeps the generated duration exact and
 * makes `duration / bars` verifiable by hand.
 */
const PLACEHOLDERS = [
  { id: "theme", bpm: 120, bars: 32, pitch: 880 },
  { id: "fantasy", bpm: 96, bars: 32, pitch: 660 },
  { id: "cyberpunk", bpm: 160, bars: 32, pitch: 1320 },
  { id: "scifi", bpm: 128, bars: 32, pitch: 523 },
];

async function writePlaceholders() {
  await requireTool("ffmpeg");
  mkdirSync(MUSIC_DIR, { recursive: true });

  for (const { id, bpm, bars, pitch } of PLACEHOLDERS) {
    const beat = 60 / bpm;
    const seconds = bars * BEATS_PER_BAR * beat;
    // A decaying sine burst at the start of every beat, with beat 1 of
    // each bar 1.9x louder so the bar line is audible — that accent is
    // what makes a mis-timed switch obvious by ear.
    const expr =
      `0.45*sin(2*PI*${pitch}*t)*exp(-14*mod(t,${beat}))` +
      `*(1+0.9*eq(mod(floor(t/${beat}),${BEATS_PER_BAR}),0))`;
    // Commas separate filters in a filterchain, so every comma inside the
    // expression has to be escaped or ffmpeg reads `mod(t` as a filter.
    const escaped = expr.replace(/,/g, "\\,");
    const out = join(MUSIC_DIR, `${id}.webm`);
    console.log(
      `writing ${id}.webm — ${bpm} BPM, ${bars} bars, ${seconds}s, ${pitch}Hz`,
    );
    await run("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `aevalsrc=exprs=${escaped}:s=48000:d=${seconds}`,
      "-t",
      String(seconds),
      "-c:a",
      "libopus",
      "-b:a",
      "64k",
      out,
    ]);
  }
  return PLACEHOLDERS.map(({ id }) => join(MUSIC_DIR, `${id}.webm`));
}

function collectFiles(targets) {
  const files = [];
  for (const target of targets) {
    const p = resolve(target);
    if (!existsSync(p)) {
      console.error(`warning: ${target} does not exist — skipping`);
      continue;
    }
    if (statSync(p).isDirectory()) {
      for (const entry of readdirSync(p)) {
        if (SOURCE_EXTS.has(extname(entry).toLowerCase())) files.push(join(p, entry));
      }
    } else {
      files.push(p);
    }
  }
  return files;
}

function reportBars(id, duration) {
  console.log(`\n${id ?? "(unrecognised)"} — ${duration.toFixed(4)}s`);
  console.log("  bars   implied BPM");
  const plausible = [];
  for (const bars of CANDIDATE_BARS) {
    const bpm = (bars * BEATS_PER_BAR * 60) / duration;
    const ok = bpm >= PLAUSIBLE_BPM.min && bpm <= PLAUSIBLE_BPM.max;
    if (ok) plausible.push({ bars, bpm });
    console.log(
      `  ${String(bars).padStart(4)}   ${bpm.toFixed(2).padStart(7)}${ok ? "   <-- plausible" : ""}`,
    );
  }
  return plausible;
}

async function main() {
  const args = process.argv.slice(2);
  const inspectOnly = args.includes("--inspect-only");
  const placeholders = args.includes("--placeholders");
  const prepare = args.includes("--prepare-loops");
  const targets = args.filter((a) => !a.startsWith("--"));

  await requireTool("ffprobe");

  let files;
  if (prepare) {
    files = await prepareLoops();
  } else if (placeholders) {
    files = await writePlaceholders();
  } else if (inspectOnly || targets.length === 0) {
    if (!existsSync(MUSIC_DIR)) {
      console.error(
        `error: ${MUSIC_DIR} does not exist.\n` +
          `Pass your source files instead:  node scripts/audio-inspect.mjs ./my-music/`,
      );
      process.exit(1);
    }
    files = collectFiles([MUSIC_DIR]);
  } else {
    await requireTool("ffmpeg");
    mkdirSync(MUSIC_DIR, { recursive: true });
    const sources = collectFiles(targets);
    files = [];
    for (const src of sources) {
      const id = inferId(src);
      if (!id) {
        console.error(
          `warning: can't tell which track "${basename(src)}" is — ` +
            `rename it to include theme/medieval/cyberpunk/space, or copy it ` +
            `into public/audio/music/ yourself.`,
        );
        continue;
      }
      const out = join(MUSIC_DIR, `${id}.webm`);
      console.log(`converting ${basename(src)} -> ${id}.webm`);
      await toOpus(src, out);
      files.push(out);
    }
  }

  if (files.length === 0) {
    console.error("error: no audio files to inspect.");
    process.exit(1);
  }

  console.log(
    "\nFor each track, find the row whose BPM looks like the music you wrote,\n" +
      "then set that `bars` value in lib/audio/manifest.ts.",
  );

  const summary = [];
  for (const file of files) {
    const duration = await probeDuration(file);
    const id = inferId(file);
    const plausible = reportBars(id, duration);
    summary.push({ id, duration, plausible });
  }

  console.log("\n--- suggested manifest values ---");
  for (const { id, duration, plausible } of summary) {
    if (plausible.length === 0) {
      console.log(
        `  ${id}: no candidate lands in ${PLAUSIBLE_BPM.min}-${PLAUSIBLE_BPM.max} BPM ` +
          `(${duration.toFixed(2)}s) — the loop may not be a whole number of bars.`,
      );
      continue;
    }
    // Every candidate is the same audio divided differently, so they all
    // sit the same distance from a whole BPM — "closest to an integer
    // tempo" cannot disambiguate them, and picking one would be a guess
    // dressed up as an answer. List them instead; only the composer
    // knows which is the arrangement.
    //
    // What each row *can* give for free is the true musical length: if a
    // row implies 119.99 BPM, the track is a 120 BPM track and the few
    // milliseconds of excess are encoder padding.
    console.log(`\n  ${id}:`);
    for (const { bars, bpm } of plausible) {
      const wholeBpm = Math.round(bpm);
      const exact = (bars * BEATS_PER_BAR * 60) / wholeBpm;
      const padding = duration - exact;
      const tight = Math.abs(bpm - wholeBpm) < 0.2;
      let line = `    { bars: ${bars}`;
      if (tight && Math.abs(padding) > 0.0005) {
        line += `, loopEndSeconds: ${exact} }   // ${wholeBpm} BPM`;
        line += `, trims ${(padding * 1000).toFixed(1)}ms of padding`;
      } else if (tight) {
        line += ` }   // ${wholeBpm} BPM, no padding`;
      } else {
        line += ` }   // ~${bpm.toFixed(2)} BPM — not a whole tempo`;
      }
      console.log(line);
    }
  }
  console.log(
    "\nNote: bar counts related by a factor of two are musically equivalent for\n" +
      "the hand-off (bar 5 of 32 and bar 5 of 64 are the same moment), so if two\n" +
      "rows differ by 2x either will work. Pick the one matching your arrangement.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
