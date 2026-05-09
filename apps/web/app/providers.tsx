"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalletProvider } from "@/components/wallet/WalletProvider";

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
      <WalletProvider>{children}</WalletProvider>
    </QueryClientProvider>
  );
}
