import { describe, expect, it } from "vitest";
import { newlyStamped } from "./seen";
import { CODEX_STEPS, type CodexStepId } from "./steps";

const ids = (...steps: CodexStepId[]) => new Set(steps);

describe("newlyStamped", () => {
  it("nothing done → nothing to celebrate", () => {
    expect(newlyStamped(ids(), ids())).toEqual([]);
  });

  it("everything done but already seen stays silent", () => {
    const all = new Set(CODEX_STEPS.map((s) => s.id));
    expect(newlyStamped(all, all)).toEqual([]);
  });

  it("only unseen completions surface", () => {
    expect(
      newlyStamped(ids("first-loot", "first-clear", "seed"), ids("first-loot")),
    ).toEqual(["first-clear", "seed"]);
  });

  it("results come back in journey order regardless of set order", () => {
    expect(newlyStamped(ids("seed", "first-loot", "three-clears"), ids())).toEqual([
      "first-loot",
      "three-clears",
      "seed",
    ]);
  });

  it("a seen step missing from done (impossible in practice) is not celebrated", () => {
    expect(newlyStamped(ids("first-loot"), ids("first-clear"))).toEqual([
      "first-loot",
    ]);
  });
});
