"use client";

import { useAccountEffect, useDisconnect } from "wagmi";

/**
 * Makes the account-modal "Disconnect" actually stick. Renders nothing.
 *
 * The bug: RainbowKit's Disconnect runs wagmi `disconnect()`, clearing the
 * in-memory connection — but on the next mount/refresh wagmi's
 * reconnect-on-mount (enabled by `getDefaultConfig`) restores it, because the
 * connector still reports itself authorized:
 *   - the burner connector is `connected = true` at module-init and regenerates
 *     a key from `localStorage` on demand, so its `isAuthorized()` is always
 *     true — it reconnects on EVERY load (see burner-connector `burner.js`); and
 *   - an injected wallet (MetaMask) still has the site connected at the
 *     extension level, so `eth_accounts` returns the address.
 * Either way the wallet silently reconnects and the disconnect "doesn't work".
 *
 * The fix is two-part, both gated on one session flag set only by a
 * *user-initiated* disconnect:
 *   1. Deterministic, at the source (WalletProvider): the burner wallet's
 *      `isAuthorized()` is wrapped to return false while this flag is set, so
 *      wagmi's reconnect-on-mount skips the burner entirely — no race.
 *   2. Belt-and-suspenders, here: for injected/extension wallets we can't gate
 *      ourselves, if an auto-reconnect (`isReconnected === true`) fires while
 *      the flag is set, immediately `disconnect()` to undo it.
 *
 * A real user connect (`isReconnected === false`) clears the flag so normal
 * refresh-persistence resumes. A plain refresh WITHOUT clicking Disconnect never
 * sets the flag, so an extension wallet stays connected across reloads as before.
 *
 * Using `isReconnected` classifies every connect at the moment it happens, with
 * no separate mount-effect timer that could race the async reconnect.
 */

// sessionStorage flag: set while the user has chosen to stay disconnected in
// this tab session. Session-scoped so closing the tab resets to default
// behavior. Read by the burner-wallet `isAuthorized` wrapper in WalletProvider.
export const USER_DISCONNECTED_KEY = "wallet:userDisconnected";

// localStorage flag: set when the user explicitly picks the burner in the
// ConnectWizard. The burner connector reports itself authorized on EVERY load
// (it's `connected = true` at module-init), so without this gate it would
// auto-connect a brand-new visitor before they ever see the wizard. Persistent
// so a returning user who already chose burner reconnects straight into the app;
// cleared on disconnect so a disconnected user returns to the wizard.
export const BURNER_ACTIVATED_KEY = "wallet:burnerActivated";

export function DisconnectGuard() {
  const { disconnect } = useDisconnect();

  useAccountEffect({
    onConnect({ isReconnected }) {
      if (typeof window === "undefined") return;

      if (!isReconnected) {
        // A real, user-initiated connect — they want to be connected again.
        sessionStorage.removeItem(USER_DISCONNECTED_KEY);
        return;
      }

      // Auto-reconnect-on-mount. The burner is already blocked by its gated
      // isAuthorized; this covers extension wallets we can't gate ourselves.
      if (sessionStorage.getItem(USER_DISCONNECTED_KEY) === "1") {
        disconnect();
      }
    },
    onDisconnect() {
      if (typeof window === "undefined") return;
      // Mark the disconnect intentional. The burner's gated isAuthorized reads
      // this on the next mount and refuses to auto-reconnect.
      sessionStorage.setItem(USER_DISCONNECTED_KEY, "1");
      // Drop the burner-activation opt-in so the wizard greets the user again
      // and the burner won't silently reconnect on the next load.
      localStorage.removeItem(BURNER_ACTIVATED_KEY);
    },
  });

  return null;
}
