import { describe, expect, it } from "vitest";
import { confirmedRequirementsForRoute } from "@/lib/recommendation/condition-confirmation";

describe("condition confirmation route scope", () => {
  it("resets carried answers when the proposed route revision changes", () => {
    expect(confirmedRequirementsForRoute(
      { context: "context", expiresAt: 1, route: ["tour:1", "tour:2"], questions: ["q1"], confirmed: ["q1"] },
      ["tour:2", "tour:1"],
      new Set(["q1"]),
    )).toEqual([]);
  });

  it("retains carried answers for the exact signed route revision", () => {
    expect(confirmedRequirementsForRoute(
      { context: "context", expiresAt: 1, route: ["tour:1", "tour:2"], questions: ["q1"], confirmed: ["q1"] },
      ["tour:1", "tour:2"],
      new Set(["q1"]),
    )).toEqual(["q1"]);
  });
});
