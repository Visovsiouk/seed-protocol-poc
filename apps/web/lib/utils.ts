import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function shortAddress(addr: `0x${string}` | string, head = 6, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/**
 * UTF-8 → base64. Prefers Node's Buffer when available (server) — `btoa`
 * exists in Node 16+ but throws InvalidCharacterError on any non-Latin-1
 * byte, and realm labels / assembled loot names can contain Unicode
 * (em dashes, accented letters), so UTF-8 encoding is required.
 */
export function b64(s: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(s, "utf8").toString("base64");
  }
  // Browser path: encode to UTF-8 bytes, repack as Latin-1 for `btoa`.
  const bytes = new TextEncoder().encode(s);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function formatEth(wei: bigint, decimals = 4): string {
  const whole = wei / 10n ** 18n;
  const frac = wei % 10n ** 18n;
  const fracStr = frac.toString().padStart(18, "0").slice(0, decimals);
  return `${whole}.${fracStr}`;
}
