import { z } from "zod";

/**
 * Shared request-validation primitives for the API routes. Pure Zod —
 * no `server-only`, no env, no RPC — so routes, client helpers, and
 * unit tests can all import them freely.
 */

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** 0x-prefixed 20-byte address (checksum casing not enforced). */
export const addressSchema = z
  .string()
  .regex(ADDRESS_RE, "expected 0x-prefixed 20-byte address");

/** 0x-prefixed 32-byte hex (run seeds, hashes). */
export const hex32 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "expected 0x-prefixed 32-byte hex");

/** Decimal bigint transported as a JSON string. */
export const bigintString = z
  .string()
  .regex(/^[0-9]+$/, "expected decimal bigint string");

/** The three starter genre presets. */
export const presetSchema = z.enum(["fantasy", "scifi", "cyberpunk"]);

/** Type-guard mirror of `addressSchema` for route params / links. */
export function isHexAddress(value: string): value is `0x${string}` {
  return ADDRESS_RE.test(value);
}
