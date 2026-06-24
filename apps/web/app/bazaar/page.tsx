import { BazaarSurface } from "@/components/bazaar/BazaarSurface";
import { ProtocolSurfaceGate } from "@/components/guards/ProtocolSurfaceGate";
import { AppShell } from "@/components/ui";

export const metadata = {
  title: "Bazaar — Realms",
};

/**
 * Read-only listings + recent sales feed. Buy/list writes wire in
 * after the value-flow demo + Trader server land. The body lives in
 * `BazaarSurface` so the HQ hub can embed the same surface as its Market
 * station; this route is kept as a thin deep-link wrapper.
 */
export default function BazaarPage() {
  return (
    <ProtocolSurfaceGate>
      <AppShell title="Bazaar" back={{ href: "/", label: "← The base" }}>
        <BazaarSurface />
      </AppShell>
    </ProtocolSurfaceGate>
  );
}
