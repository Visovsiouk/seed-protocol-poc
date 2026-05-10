"use client";

/**
 * Distinguishes dev-wallet-listed Genesis bazaar inventory from
 * player-listed assets.
 */
export function PreseedBadge({ preseed }: { preseed: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
      style={
        preseed
          ? {
              background: "rgba(124,92,255,0.15)",
              color: "#b3a1ff",
              border: "1px solid rgba(124,92,255,0.4)",
            }
          : {
              background: "rgba(74,216,255,0.12)",
              color: "#7be2ff",
              border: "1px solid rgba(74,216,255,0.35)",
            }
      }
    >
      {preseed ? "Genesis liquidity" : "Player-listed"}
    </span>
  );
}
