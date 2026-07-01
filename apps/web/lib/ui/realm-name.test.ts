import { describe, expect, it } from "vitest";
import { isCleanRealmName } from "./realm-name";

describe("isCleanRealmName", () => {
  it("accepts an ordinary realm name", () => {
    expect(isCleanRealmName("The Hollow Sanctum")).toBe(true);
  });

  it("accepts an empty string (length is enforced elsewhere)", () => {
    expect(isCleanRealmName("")).toBe(true);
  });

  it("rejects a name containing a flagged word", () => {
    expect(isCleanRealmName("shit realm")).toBe(false);
  });

  it("rejects obfuscated profanity (leetspeak substitution)", () => {
    expect(isCleanRealmName("sh1t realm")).toBe(false);
  });
});
