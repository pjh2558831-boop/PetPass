import { describe, expect, it } from "vitest";
import { tourPetAccessVerdictLabel } from "@/lib/pet-access/tourism/verdict-label";

describe("tourPetAccessVerdictLabel", () => {
  it("uses cautious Jeju map labels for conditional and unknown evidence", () => {
    expect(tourPetAccessVerdictLabel("conditional", "jeju")).toBe(
      "동반 조건 확인 필요",
    );
    expect(tourPetAccessVerdictLabel("unknown", "jeju")).toBe(
      "동반 정보 확인 필요",
    );
  });

  it("preserves the established Busan detail labels", () => {
    expect(tourPetAccessVerdictLabel("conditional", "busan")).toBe(
      "조건부 동반 가능",
    );
    expect(tourPetAccessVerdictLabel("unknown", "busan")).toBe(
      "반려동물 동반 여부 확인 필요",
    );
  });
});
