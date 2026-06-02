import { describe, expect, it } from "vitest";
import { encodeEventTopics } from "viem";
import { ecosystemTemplateAbi } from "@abis/generated";
import { parseSchemaRegistered } from "./schema-register-parse";

const REALM: `0x${string}` = "0x000000000000000000000000000000000000bee5";
const OTHER: `0x${string}` = "0x0000000000000000000000000000000000000bad";

function schemaRegisteredLog(emitter: `0x${string}`, schemaId: bigint) {
  // `schemaId` is the sole (indexed) field, so it lives in topics and
  // `data` is empty. Encode via viem so the test exercises the same
  // decode path an on-chain log takes.
  const topics = encodeEventTopics({
    abi: ecosystemTemplateAbi,
    eventName: "SchemaRegistered",
    args: { schemaId },
  });
  return {
    address: emitter,
    topics: topics as readonly `0x${string}`[],
    data: "0x" as `0x${string}`,
  };
}

describe("parseSchemaRegistered", () => {
  it("returns the schemaId from a matching log", () => {
    expect(parseSchemaRegistered([schemaRegisteredLog(REALM, 42n)], REALM)).toBe(
      42n,
    );
  });

  it("matches the realm address case-insensitively", () => {
    const log = schemaRegisteredLog(REALM, 7n);
    expect(
      parseSchemaRegistered([log], REALM.toUpperCase() as `0x${string}`),
    ).toBe(7n);
  });

  it("returns null when no log was emitted by the realm", () => {
    expect(parseSchemaRegistered([schemaRegisteredLog(OTHER, 1n)], REALM)).toBeNull();
  });

  it("returns null on an empty log list", () => {
    expect(parseSchemaRegistered([], REALM)).toBeNull();
  });

  it("ignores non-SchemaRegistered logs from the realm", () => {
    // A log whose topic shape doesn't decode against the template ABI's
    // SchemaRegistered event must be skipped, not throw.
    const junk = {
      address: REALM,
      topics: ["0x" + "ab".repeat(32)] as readonly `0x${string}`[],
      data: "0x" as `0x${string}`,
    };
    expect(parseSchemaRegistered([junk], REALM)).toBeNull();
  });

  it("picks the first matching log when several are present", () => {
    const logs = [
      schemaRegisteredLog(OTHER, 99n),
      schemaRegisteredLog(REALM, 3n),
      schemaRegisteredLog(REALM, 4n),
    ];
    expect(parseSchemaRegistered(logs, REALM)).toBe(3n);
  });
});
