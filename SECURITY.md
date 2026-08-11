# Security policy

## Reporting a vulnerability

Email **<seed@visovsio.uk>**. Please do not open a public GitHub issue for
security problems — reports sent by email can be fixed before they are
disclosed.

Include what you can: the affected endpoint or contract, steps to reproduce,
and the impact you believe it has. You will get a reply as soon as possible.

## Scope

This project is a proof of concept. The live demo at
<https://play.seed-protocol.visovsio.uk/> runs an anvil dev chain behind an
allowlist JSON-RPC proxy, and some behaviors are insecure **by design** for a
demo of this kind (see the README's [Security notes](README.md#security-notes)):

- anvil cheat methods exist on the node; only the allowlist proxy is exposed
  publicly, and the faucet's `anvil_setBalance` is a deliberate feature.
- Local development uses the well-known Anvil test mnemonic. That is expected
  locally and is not a finding.

Reports about the protocol contracts, the server-signed game routes
(`/api/realm/*`, `/api/trader/*`), the RPC allowlist proxy, or ways to mint,
spend, or trade assets outside the game rules are very welcome.
