import { describe, expect, it } from "vitest";
import { encodeEventTopics, pad, toHex } from "viem";
import { ecosystemFactoryAbi } from "@abis/generated";
import { parseEcosystemCreated } from "./factory-parse";

const FACTORY: `0x${string}` = "0x000000000000000000000000000000000000fac0";
const OTHER: `0x${string}` = "0x0000000000000000000000000000000000000bad";
const ECOSYSTEM: `0x${string}` = "0x000000000000000000000000000000000000beef";
const OWNER: `0x${string}` = "0x0000000000000000000000000000000000001111";

function ecosystemCreatedLog(
  emitter: `0x${string}`,
  ecosystem: `0x${string}`,
  owner: `0x${string}`,
) {
  // Both event fields are `indexed`, so they live in topics and `data`
  // is empty. Build the topics array via viem's encoder so the test
  // exercises the same path the on-chain log takes.
  const topics = encodeEventTopics({
    abi: ecosystemFactoryAbi,
    eventName: "EcosystemCreated",
    args: { ecosystem, owner },
  });
  return {
    address: emitter,
    topics: topics as readonly `0x${string}`[],
    data: "0x" as `0x${string}`,
  };
}

// viem returns checksummed (mixed-case) addresses from `decodeEventLog`,
// while our test constants are lowercase. Compare lowercased to keep
// equality checks robust against EIP-55 casing.
function lower(addr: `0x${string}`): string {
  return addr.toLowerCase();
}

describe("parseEcosystemCreated", () => {
  it("returns the (ecosystem, owner) tuple from a matching log", () => {
    const result = parseEcosystemCreated(
      [ecosystemCreatedLog(FACTORY, ECOSYSTEM, OWNER)],
      FACTORY,
    );
    expect(result).not.toBeNull();
    expect(lower(result!.ecosystem)).toBe(lower(ECOSYSTEM));
    expect(lower(result!.owner)).toBe(lower(OWNER));
  });

  it("returns null when no log matches the factory address", () => {
    const result = parseEcosystemCreated(
      [ecosystemCreatedLog(OTHER, ECOSYSTEM, OWNER)],
      FACTORY,
    );
    expect(result).toBeNull();
  });

  it("returns null on an empty log list", () => {
    expect(parseEcosystemCreated([], FACTORY)).toBeNull();
  });

  it("matches the factory address case-insensitively", () => {
    const upperFactory = FACTORY.toUpperCase() as `0x${string}`;
    const result = parseEcosystemCreated(
      [ecosystemCreatedLog(FACTORY, ECOSYSTEM, OWNER)],
      upperFactory,
    );
    expect(result).not.toBeNull();
    expect(lower(result!.ecosystem)).toBe(lower(ECOSYSTEM));
  });

  it("skips unrelated logs from the factory and picks the EcosystemCreated one", () => {
    // A log emitted by the factory with topics that don't match
    // EcosystemCreated should be silently skipped, not crash the parser.
    const noise = {
      address: FACTORY,
      topics: [pad(toHex(1), { size: 32 })] as readonly `0x${string}`[],
      data: "0x" as `0x${string}`,
    };
    const result = parseEcosystemCreated(
      [noise, ecosystemCreatedLog(FACTORY, ECOSYSTEM, OWNER)],
      FACTORY,
    );
    expect(result).not.toBeNull();
    expect(lower(result!.ecosystem)).toBe(lower(ECOSYSTEM));
  });

  it("returns the first match when multiple EcosystemCreated logs are present", () => {
    const second: `0x${string}` = "0x000000000000000000000000000000000000feed";
    const result = parseEcosystemCreated(
      [
        ecosystemCreatedLog(FACTORY, ECOSYSTEM, OWNER),
        ecosystemCreatedLog(FACTORY, second, OWNER),
      ],
      FACTORY,
    );
    expect(lower(result!.ecosystem)).toBe(lower(ECOSYSTEM));
  });
});
