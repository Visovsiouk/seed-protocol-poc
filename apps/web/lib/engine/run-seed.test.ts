import { describe, it, expect } from "vitest";
import { deriveRunSeed } from "./run-seed";

const PLAYER_A: `0x${string}` = "0x000000000000000000000000000000000000aaaa";
const PLAYER_B: `0x${string}` = "0x000000000000000000000000000000000000bbbb";

// 32-byte hashes (any deterministic value works for the unit tests; viem
// only cares that it's parseable bytes32).
const BLOCK_X: `0x${string}` =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const BLOCK_Y: `0x${string}` =
  "0x2222222222222222222222222222222222222222222222222222222222222222";

describe("deriveRunSeed", () => {
  it("is deterministic for the same inputs", () => {
    const a = deriveRunSeed({ player: PLAYER_A, blockhash: BLOCK_X, nonce: 1n });
    const b = deriveRunSeed({ player: PLAYER_A, blockhash: BLOCK_X, nonce: 1n });
    expect(a).toBe(b);
  });

  it("changes when the player changes", () => {
    const a = deriveRunSeed({ player: PLAYER_A, blockhash: BLOCK_X, nonce: 1n });
    const b = deriveRunSeed({ player: PLAYER_B, blockhash: BLOCK_X, nonce: 1n });
    expect(a).not.toBe(b);
  });

  it("changes when the blockhash changes", () => {
    const a = deriveRunSeed({ player: PLAYER_A, blockhash: BLOCK_X, nonce: 1n });
    const b = deriveRunSeed({ player: PLAYER_A, blockhash: BLOCK_Y, nonce: 1n });
    expect(a).not.toBe(b);
  });

  it("changes when the nonce changes", () => {
    const a = deriveRunSeed({ player: PLAYER_A, blockhash: BLOCK_X, nonce: 1n });
    const b = deriveRunSeed({ player: PLAYER_A, blockhash: BLOCK_X, nonce: 2n });
    expect(a).not.toBe(b);
  });

  it("returns a 32-byte hex string (0x + 64 hex chars)", () => {
    const seed = deriveRunSeed({
      player: PLAYER_A,
      blockhash: BLOCK_X,
      nonce: 42n,
    });
    expect(seed).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
