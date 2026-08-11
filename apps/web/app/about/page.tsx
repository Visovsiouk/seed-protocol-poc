import { AppShell } from "@/components/ui/AppShell";
import { Panel, Stamp, Rule, Footnote } from "@/components/ui";

export const metadata = {
  title: "About — Realms",
};

export default function AboutPage() {
  return (
    <AppShell title="About">
      <article className="mx-auto flex max-w-2xl flex-col gap-6">
        <Panel as="section" tone="parchment" className="flex flex-col gap-4 p-6">
          <Stamp>About</Stamp>
          <Rule />
          <p className="font-mono text-sm italic leading-relaxed opacity-85">
            I&apos;m{" "}
            <a
              href="https://www.linkedin.com/in/giourivis/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-preset-accent)] hover:underline"
            >
              Giouri Visovsiouk
            </a>
            . I designed the Seed Protocol and built Realms as a personal challenge.
             There is nothing groundbreaking here, just me having fun. All of it 
             is open to read:
          </p>
          <ul className="flex flex-col gap-1.5 font-mono text-sm">
            <li>
              <a
                href="https://github.com/Visovsiouk/seed-protocol"
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-70 hover:underline hover:opacity-100"
              >
                Protocol contracts · github.com/Visovsiouk/seed-protocol
              </a>
            </li>
            <li>
              <a
                href="https://github.com/Visovsiouk/seed-protocol-poc"
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-70 hover:underline hover:opacity-100"
              >
                This game&apos;s source · github.com/Visovsiouk/seed-protocol-poc
              </a>
            </li>
            <li>
              <a
                href="https://github.com/Visovsiouk/seed-protocol/blob/main/docs/The_Seed_Protocol_WhitePaper_v1.0.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-70 hover:underline hover:opacity-100"
              >
                White Paper v1.0 · PDF
              </a>
            </li>
          </ul>
          <p className="font-mono text-sm italic leading-relaxed opacity-85">
            Realms is a proof of the Seed Protocol: a permanent on-chain ledger
            of who made what, who owns it now, and where every royalty goes.
            Everything you see is real chain state. Nothing is faked to make the
            demo look busier than it is.
          </p>

          <Footnote>Seed Protocol · proof of concept</Footnote>
        </Panel>

        <Panel as="section" tone="parchment" className="flex flex-col gap-3 p-6">
          <Stamp >Contact</Stamp>
          <Rule />
          <p className="text-sm leading-relaxed opacity-80">
            Found a security bug? Email me at{" "}
            <a
              href="mailto:seed@visovsio.uk"
              className="text-[var(--color-preset-accent)] hover:underline"
            >
              seed@visovsio.uk
            </a>{" "}
            instead of opening a public issue.
          </p>
        </Panel>
      </article>
    </AppShell>
  );
}
