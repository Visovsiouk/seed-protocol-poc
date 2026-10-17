import { describe, expect, it } from "vitest";

import { getClientIp } from "./client-ip";

/** Builds a Request carrying only the given headers. */
function reqWith(headers: Record<string, string>): Request {
  return new Request("https://play.example.com/api/trader/buy", {
    method: "POST",
    headers,
  });
}

describe("getClientIp", () => {
  it("returns the sole hop when one proxy sits in front", () => {
    expect(getClientIp(reqWith({ "x-forwarded-for": "203.0.113.7" }))).toBe(
      "203.0.113.7",
    );
  });

  it("takes the LAST hop, which is the one our proxy appended", () => {
    // Caddy appends the real peer, so the trustworthy entry is rightmost.
    expect(
      getClientIp(
        reqWith({ "x-forwarded-for": "198.51.100.1, 203.0.113.7" }),
      ),
    ).toBe("203.0.113.7");
  });

  it("ignores a forged leading XFF entry (the rate-limit bypass)", () => {
    // The regression this function exists to prevent: a caller rotating a
    // spoofed leading value must NOT get a fresh rate-limit bucket. Every
    // request below is the same real peer, so every key must be identical.
    const spoofed = ["1.2.3.4", "5.6.7.8", "9.10.11.12", ""].map((forged) =>
      getClientIp(
        reqWith({ "x-forwarded-for": `${forged}, 203.0.113.7` }),
      ),
    );
    expect(new Set(spoofed)).toEqual(new Set(["203.0.113.7"]));
  });

  it("tolerates whitespace and trailing commas", () => {
    expect(
      getClientIp(
        reqWith({ "x-forwarded-for": "  198.51.100.1 ,  203.0.113.7  ," }),
      ),
    ).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip only when no XFF is present", () => {
    expect(getClientIp(reqWith({ "x-real-ip": "203.0.113.9" }))).toBe(
      "203.0.113.9",
    );
  });

  it("prefers XFF over x-real-ip, which Caddy never sets", () => {
    expect(
      getClientIp(
        reqWith({
          "x-forwarded-for": "203.0.113.7",
          "x-real-ip": "1.2.3.4",
        }),
      ),
    ).toBe("203.0.113.7");
  });

  it("returns a stable sentinel when no forwarding headers exist", () => {
    expect(getClientIp(reqWith({}))).toBe("unknown");
  });

  it("does not fall through to x-real-ip for an all-empty XFF", () => {
    // An XFF of only separators yields no usable hop; the x-real-ip fallback
    // is caller-supplied, so a present-but-empty XFF must not unlock it as a
    // spoofing channel. "unknown" buckets together, which fails closed.
    expect(
      getClientIp(reqWith({ "x-forwarded-for": " , ", "x-real-ip": "1.2.3.4" })),
    ).toBe("unknown");
  });
});
