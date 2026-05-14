import { ConnectButton } from "@/components/wallet/ConnectButton";
import { RealmSelector } from "@/components/game/RealmSelector";

/**
 * Landing page. Surfaces the three starter realms via
 * `<RealmSelector/>` plus the bazaar entry. polishes this with
 * the `<HeroIntro/>` + `<IntroReel/>` treatment; for now the picker is
 * the primary CTA.
 */
export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center gap-10 px-6 py-16">
      <header className="absolute top-6 right-6">
        <ConnectButton />
      </header>
      <section className="max-w-2xl flex flex-col items-center gap-4 text-center">
        <h1 className="text-5xl font-semibold tracking-tight">Realms</h1>
        <p className="text-lg opacity-80">
          A reference application for the Seed Protocol — universal assets,
          adoptable schemas, and provenance-bound royalties, demonstrated through
          a dice-driven text RPG.
        </p>
      </section>

      <section className="w-full flex flex-col items-center gap-4">
        <h2 className="text-sm font-medium uppercase tracking-widest opacity-60">
          Choose a realm
        </h2>
        <RealmSelector />
      </section>

      <a
        href="/bazaar"
        className="rounded-md px-6 py-3 font-medium transition"
        style={{
          background: "transparent",
          border: "1px solid rgba(255,255,255,0.2)",
          color: "var(--color-preset-fg)",
        }}
      >
        Visit the Bazaar →
      </a>

      <p className="text-sm opacity-50">
        Phase 2 in progress — the engine runs locally; on-chain mints arrive in 2C.
      </p>
    </main>
  );
}
