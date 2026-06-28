"use client";

import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui";
import { AddNetworkButton } from "./AddNetworkButton";

/**
 * Diegetic wallet trigger. Wraps RainbowKit's headless `ConnectButton.Custom`
 * so the trigger is our own preset-accented `Button` rather than RainbowKit's
 * fixed-violet chrome — the connect affordance now recolours with the realm
 * like every other action. App code never imports from RainbowKit directly,
 * so the connector swap surface stays in this one file.
 *
 * The three states map onto Button intents:
 *   not connected → diegetic "Connect wallet"
 *   wrong network → danger "Wrong network"
 *   connected     → ghost account pill (chain + truncated address)
 *
 * No mount guard required: WalletProvider is statically imported (see
 * app/providers.tsx) so WagmiProvider context is in scope on every render.
 */
export function ConnectButton() {
  return (
    <RKConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <Button intent="diegetic" onClick={openConnectModal}>
                    Connect wallet
                  </Button>
                );
              }

              if (chain.unsupported) {
                return (
                  <div className="flex items-center gap-2">
                    <Button intent="danger" onClick={openChainModal}>
                      Wrong network
                    </Button>
                    <AddNetworkButton />
                  </div>
                );
              }

              return (
                <div className="flex items-center gap-2">
                  <Button intent="ghost" size="sm" onClick={openChainModal}>
                    {chain.hasIcon && chain.iconUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={chain.name ?? "Chain"}
                        src={chain.iconUrl}
                        className="h-4 w-4 rounded-full"
                      />
                    )}
                    {chain.name}
                  </Button>
                  <Button intent="ghost" size="sm" onClick={openAccountModal}>
                    {account.displayName}
                  </Button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </RKConnectButton.Custom>
  );
}
