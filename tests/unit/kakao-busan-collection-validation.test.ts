import { describe, expect, it } from "vitest";
import { validateKakaoBusanCollectionResult } from "@/lib/kakao/collection/validation";
import type { KakaoPlaceSearchResult } from "@/types/kakao";

function place(
  overrides: Partial<KakaoPlaceSearchResult> = {},
): KakaoPlaceSearchResult {
  return {
    id: "kakao-1",
    name: "광안 반려 카페",
    address: "부산광역시 수영구 광안동 1",
    roadAddress: "부산광역시 수영구 광안해변로 1",
    categoryName: "음식점 > 카페",
    categoryGroupCode: "CE7",
    coordinates: { latitude: 35.1456, longitude: 129.1131 },
    ...overrides,
  };
}

describe("Kakao Busan collection result validation", () => {
  it("accepts an exact official district token and prefers the road address", () => {
    expect(validateKakaoBusanCollectionResult(place(), "500")).toEqual({
      accepted: true,
      canonicalAddress: "부산광역시 수영구 광안해변로 1",
      district: { code: "500", name: "수영구" },
      reasonCodes: [],
    });
  });

  it("does not mistake 강서구 for 서구 through substring matching", () => {
    const result = validateKakaoBusanCollectionResult(
      place({
        address: "부산광역시 강서구 명지동 1",
        roadAddress: "부산광역시 강서구 명지국제로 1",
      }),
      "140",
    );
    expect(result).toMatchObject({
      accepted: false,
      reasonCodes: ["district_mismatch"],
    });
  });

  it("rejects outside-Busan, conflicting, and missing addresses", () => {
    expect(
      validateKakaoBusanCollectionResult(
        place({
          address: "울산광역시 남구 삼산동 1",
          roadAddress: "울산광역시 남구 삼산로 1",
        }),
        "500",
      ).reasonCodes,
    ).toEqual(["outside_busan"]);
    expect(
      validateKakaoBusanCollectionResult(
        place({
          address: "부산시 수영구 광안동 1",
          roadAddress: "부산시 수영구 광안해변로 1",
        }),
        "500",
      ).reasonCodes,
    ).toEqual(["outside_busan"]);
    expect(
      validateKakaoBusanCollectionResult(
        place({
          address: "부산광역시 해운대구 우동 1",
          roadAddress: "부산광역시 수영구 광안해변로 1",
        }),
        "500",
      ).reasonCodes,
    ).toEqual(["conflicting_districts"]);
    expect(
      validateKakaoBusanCollectionResult(
        place({ address: "", roadAddress: undefined }),
        "500",
      ).reasonCodes,
    ).toEqual(["missing_address"]);
  });

  it("rejects a result when either supplied address escapes Busan", () => {
    const validation = validateKakaoBusanCollectionResult(
      place({
        roadAddress: "부산광역시 수영구 광안해변로 1",
        address: "서울특별시 강남구 역삼동 1",
      }),
      "500",
    );

    expect(validation.accepted).toBe(false);
    expect(validation.reasonCodes).toContain("outside_busan");
  });

  it("rejects non-finite, zero, globally invalid, and non-Busan coordinates", () => {
    expect(
      validateKakaoBusanCollectionResult(
        place({ coordinates: { latitude: Number.NaN, longitude: 129.1 } }),
        "500",
      ).reasonCodes,
    ).toEqual(["invalid_coordinates"]);
    expect(
      validateKakaoBusanCollectionResult(
        place({ coordinates: { latitude: 0, longitude: 0 } }),
        "500",
      ).reasonCodes,
    ).toEqual(["invalid_coordinates"]);
    expect(
      validateKakaoBusanCollectionResult(
        place({ coordinates: { latitude: 35.1, longitude: 200 } }),
        "500",
      ).reasonCodes,
    ).toEqual(["invalid_coordinates"]);
    expect(
      validateKakaoBusanCollectionResult(
        place({ coordinates: { latitude: 37.5, longitude: 127 } }),
        "500",
      ).reasonCodes,
    ).toEqual(["coordinates_outside_busan"]);
  });

  it("rejects an unknown expected district without guessing", () => {
    expect(
      validateKakaoBusanCollectionResult(place(), "999"),
    ).toMatchObject({
      accepted: false,
      district: null,
      reasonCodes: ["unknown_district"],
    });
  });
});
