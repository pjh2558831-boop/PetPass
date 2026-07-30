import { describe, expect, it } from "vitest";
import { isPotentialLicenseMatch } from "@/lib/licenses/matcher";

describe("license matcher", () => {
  it("matches normalized business names and compatible addresses", () => {
    expect(
      isPotentialLicenseMatch(
        { name: "마린 테라스 식탁", address: "부산 해운대구 달맞이길 10" },
        { name: "마린테라스식탁", address: "부산광역시 해운대구 달맞이길 10" },
      ),
    ).toBe(true);
  });

  it("does not match by address alone", () => {
    expect(
      isPotentialLicenseMatch(
        { name: "서로 다른 상호", address: "부산 해운대구 달맞이길 10" },
        { name: "마린테라스식탁", address: "부산 해운대구 달맞이길 10" },
      ),
    ).toBe(false);
  });
});
