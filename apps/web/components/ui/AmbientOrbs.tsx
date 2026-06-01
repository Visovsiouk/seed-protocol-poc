/**
 * AmbientOrbs.
 *
 * The dark-glassmorphism backdrop: a small number of slow-drifting blurred
 * orbs in the preset accent, sitting behind the data-glass. Pure CSS (the
 * `.ambient-orb` class + `orb-drift` keyframes live in globals.css) so it's
 * GPU-cheap and zero-JS; `prefers-reduced-motion` disables the drift there.
 *
 * Rendered once by the AppShell as a fixed, non-interactive layer. Each orb
 * gets a position/size/delay so they don't pulse in lockstep.
 */

const ORBS = [
  { top: "-8%", left: "-6%", size: 420, delay: "0s", opacity: 0.2 },
  { top: "55%", left: "70%", size: 360, delay: "-7s", opacity: 0.16 },
  { top: "30%", left: "35%", size: 280, delay: "-13s", opacity: 0.12 },
] as const;

export function AmbientOrbs() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {ORBS.map((o, i) => (
        <span
          key={i}
          className="ambient-orb"
          style={{
            top: o.top,
            left: o.left,
            width: o.size,
            height: o.size,
            opacity: o.opacity,
            animationDelay: o.delay,
          }}
        />
      ))}
    </div>
  );
}
