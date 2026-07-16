import { describe, expect, it } from "vitest";
import { parseTraderResponse } from "./index";

describe("parseTraderResponse", () => {
  it("passes through an ok envelope", () => {
    const res = parseTraderResponse(
      200,
      JSON.stringify({ ok: true, txHash: "0xabc" }),
    );
    expect(res).toEqual({ ok: true, txHash: "0xabc" });
  });

  it("passes through an error envelope", () => {
    const res = parseTraderResponse(
      400,
      JSON.stringify({ ok: false, reason: "overpriced", message: "too dear" }),
    );
    expect(res).toEqual({
      ok: false,
      reason: "overpriced",
      message: "too dear",
    });
  });

  it("turns an empty body into a readable internal error", () => {
    const res = parseTraderResponse(500, "");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("internal");
      expect(res.message).toContain("HTTP 500");
      expect(res.message).not.toContain("Unexpected end of JSON input");
    }
  });

  it("turns an HTML error page into a readable internal error", () => {
    const res = parseTraderResponse(502, "<html>Bad Gateway</html>");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("internal");
      expect(res.message).toContain("HTTP 502");
    }
  });
});
