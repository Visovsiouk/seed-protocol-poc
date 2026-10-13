/**
 * PlayerSigil — your address, drawn.
 *
 * A small heraldic crest derived from the connected wallet's nibbles. Strokes
 * in `currentColor`, so the same wallet shows the same shape in a different
 * hue in every realm — you are the constant, the world is not.
 *
 * Fixed-size and unanimated: it lives in the player bar's vitals row beside
 * live HP, where a breathing or resizing mark would compete with the numbers
 * that actually matter.
 */

import type { Shape } from "@/lib/art/archetypes";
import { sigilSpec } from "@/lib/art/sigil";
import { INK } from "@/lib/art/palette";

function draw(shape: Shape, key: string, dashed: boolean) {
  if (shape.kind === "circle") {
    return (
      <circle
        key={key}
        cx={shape.cx}
        cy={shape.cy}
        r={shape.r}
        fill={shape.filled ? INK : "none"}
        stroke={shape.filled ? "none" : INK}
        strokeWidth={2}
        strokeDasharray={dashed ? "6 5" : undefined}
      />
    );
  }
  return (
    <path
      key={key}
      d={shape.d}
      fill={shape.filled ? INK : "none"}
      stroke={INK}
      strokeWidth={shape.weight ?? 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dashed ? "6 5" : undefined}
    />
  );
}

export function PlayerSigil({
  address,
  size = 40,
  className,
}: {
  address?: string | null;
  size?: number;
  className?: string;
}) {
  const spec = sigilSpec(address);
  const dashed = spec.placeholder;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role="img"
      aria-label={dashed ? "No wallet connected" : "Your crest"}
      focusable="false"
      // The placeholder reads as "not yet" rather than as a real identity.
      opacity={dashed ? 0.35 : 1}
    >
      {spec.rings.map((s, i) => draw(s, `r${i}`, dashed))}
      {spec.spokes.map((s, i) => draw(s, `s${i}`, dashed))}
      {spec.satellites.map((s, i) => draw(s, `t${i}`, dashed))}
      {draw(spec.core, "core", dashed)}
    </svg>
  );
}
