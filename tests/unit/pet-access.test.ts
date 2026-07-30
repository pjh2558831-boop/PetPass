import { describe, expect, it } from "vitest";
import { demoProfile } from "@/fixtures/demo-data";
import { evaluatePetAccess } from "@/lib/pet-access/evaluator";
import { parsePetPolicy } from "@/lib/pet-access/parser";

const metadata = {
  sourceName: "test source",
  retrievedAt: "2026-07-30T09:00:00.000Z",
};

describe("pet access evaluator", () => {
  it("keeps ambiguous source text in needs confirmation", () => {
    const policy = parsePetPolicy("반려동물 동반 가능, 자세한 사항 문의");
    const result = evaluatePetAccess(demoProfile, policy, metadata);
    expect(result.status).toBe("NEEDS_CONFIRMATION");
    expect(result.originalSourceText).toBe(policy.originalText);
  });

  it("does not add restrictions that are absent from the source policy", () => {
    const policy = parsePetPolicy("반려견 전 구역 동반 가능");
    const result = evaluatePetAccess(demoProfile, policy, metadata);
    expect(result.restrictions).toEqual(policy.restrictions);
    expect(result.requiredItems).toEqual([]);
  });

  it("rejects a missing explicitly required carrier", () => {
    const policy = parsePetPolicy("소형견은 이동장 사용 필수");
    const result = evaluatePetAccess(
      { ...demoProfile, hasCarrier: false },
      policy,
      metadata,
    );
    expect(result.status).toBe("NOT_MATCHED");
    expect(result.requiredItems).toContain("이동장");
  });
});
