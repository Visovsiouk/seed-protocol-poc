"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import { NotificationProvider } from "@/components/ui/Toast";
import { CornerDock } from "@/components/dock/CornerDock";
import { AudioProvider } from "@/lib/audio/AudioProvider";

/**
 * Root client-side provider stack.
 *
 * History note: an earlier iteration dynamic-imported WalletProvider with
 * `ssr: false` because WalletConnect's universal-provider hit `indexedDB`
 * at module init. We've since dropped the WalletConnect connector
 * (see WalletProvider.tsx for why), so the wagmi/RainbowKit wrapper is
 * SSR-safe and gets statically imported again.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        {/* Outside NotificationProvider so toasts can fire SFX through
            useAudio(). Owns the audio graph, the first-gesture unlock and
            the delegated click SFX, so it has to sit above everything
            that makes noise. */}
        <AudioProvider>
          <NotificationProvider>
            {children}
            {/* Floating bottom-right dock (Inventory + Codex + Sound) + the
                codex completion-toast watcher — global so they travel with
                the player. */}
            <CornerDock />
          </NotificationProvider>
        </AudioProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
}
