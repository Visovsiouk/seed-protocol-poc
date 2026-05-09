"use client";

import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit";

/**
 * Thin wrapper around RainbowKit's ConnectButton. Re-exported so app code
 * never imports from RainbowKit directly — the connector swap surface
 * stays in one file.
 *
 * No mount guard required: WalletProvider is statically imported (see
 * app/providers.tsx) so WagmiProvider context is in scope on every render.
 */
export function ConnectButton() {
  return <RKConnectButton showBalance={false} chainStatus="icon" />;
}
