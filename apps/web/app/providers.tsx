"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import { NotificationProvider } from "@/components/ui/Toast";
import { CodexWidget } from "@/components/codex/CodexWidget";

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
        <NotificationProvider>
          {children}
          {/* Floating protocol-codex chrome + its completion-toast watcher —
              global so the journey map travels with the player. */}
          <CodexWidget />
        </NotificationProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
}
