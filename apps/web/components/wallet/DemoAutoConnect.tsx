"use client";

import { useEffect } from "react";
import { useAccount, useConnect } from "wagmi";

/**
 * Demo-mode helper. Mounted only when `demoMode` is true (see WalletProvider).
 * On mount, if no account is connected, it connects the mock connector so the
 * demo anvil account is live before the first page interaction — belt-and-
 * suspenders alongside the connector's `defaultConnected`/`reconnect` features.
 * Renders nothing.
 */
export function DemoAutoConnect() {
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();

  useEffect(() => {
    if (isConnected) return;
    const mockConnector = connectors.find((c) => c.id === "mock");
    if (mockConnector) connect({ connector: mockConnector });
  }, [isConnected, connect, connectors]);

  return null;
}
