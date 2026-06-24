import { GenesisLedger } from "@/components/genesis/GenesisLedger";
import { ProtocolSurfaceGate } from "@/components/guards/ProtocolSurfaceGate";
import { AppShell } from "@/components/ui";

export const metadata = {
  title: "Genesis — Realms",
};

/**
 * `/genesis` — the Seed-claim credential route. The credential body lives in
 * `GenesisLedger` so the HQ hub can embed it as its Altar station; this route
 * is kept as a thin deep-link wrapper, gated behind `ProtocolSurfaceGate`.
 */
export default function GenesisPage() {
  return (
    <ProtocolSurfaceGate>
      <AppShell title="Genesis" back={{ href: "/", label: "← The base" }}>
        <GenesisLedger />
      </AppShell>
    </ProtocolSurfaceGate>
  );
}
