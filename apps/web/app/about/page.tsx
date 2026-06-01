import { AppShell } from "@/components/ui/AppShell";
import { Panel, Stamp, Rule, Footnote } from "@/components/ui";

export const metadata = {
  title: "About — Realms",
};

/**
 * proof route. A single diegetic ledger page
 * explaining the Wandering Trader and the demo's honesty caveats
 *. Built entirely on the shared kit + AppShell — no inline
 * panel/button styling — so it doubles as the foundation's smoke test.
 */
export default function AboutPage() {
  return (
    <AppShell title="About">
      <article className="mx-auto flex max-w-2xl flex-col gap-6">
        <Panel as="section" tone="parchment" className="flex flex-col gap-4 p-6">
          <Stamp>Recovered page · on the honesty of this demo</Stamp>
          <Rule />
          <p className="font-mono text-sm italic leading-relaxed opacity-85">
            <span aria-hidden className="mr-2 opacity-50">
              —
            </span>
            Realms is a proof of the Seed Protocol: a permanent, on-chain ledger
            of who made what, who owns it now, and where every royalty flows.
            Everything you see here is real testnet state. Nothing is faked to
            look busier than it is.
          </p>
          <Footnote>Seed Protocol · proof of concept</Footnote>
        </Panel>

        <Panel as="section" tone="glass-1" className="flex flex-col gap-3 p-6">
          <Stamp tone="muted">The Wandering Trader</Stamp>
          <Rule tone="muted" />
          <p className="text-sm leading-relaxed opacity-80">
            A single-wallet visitor can&apos;t demonstrate a sale alone — so the
            demo ships a transparent counter-party, the{" "}
            <strong>Wandering Trader</strong>. It takes the other side of a trade
            only when you press an explicitly-labelled demo button, and never runs
            in the background. Its transactions are signed by a small serverless
            route, testnet only, so its key never touches your browser.
          </p>
        </Panel>

        <Panel as="section" tone="glass-1" className="flex flex-col gap-3 p-6">
          <Stamp tone="muted">What is and isn&apos;t simulated</Stamp>
          <Rule tone="muted" />
          <p className="text-sm leading-relaxed opacity-80">
            Empty surfaces read as honest ledger entries (&ldquo;Awaiting first
            player&rdquo;), never seeded with fake activity. Narration is templated
            from per-preset flavour banks — varied enough for a session, honestly
            repetitive over many. Ambient royalty earnings from strangers trading
            weeks later stay theatrical; the value-flow you trigger yourself is the
            real fee split, on chain.
          </p>
        </Panel>
      </article>
    </AppShell>
  );
}
