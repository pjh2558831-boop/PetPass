import { describe, expect, it } from "vitest";
import {
  KAKAO_BUSAN_COLLECTION_QUERIES,
  KAKAO_BUSAN_MAX_PAGES_PER_QUERY,
  KAKAO_BUSAN_QUERY_COUNT,
  KAKAO_BUSAN_QUERY_FAMILIES,
  KAKAO_BUSAN_QUERY_REGISTRY_VERSION,
  KAKAO_BUSAN_THEORETICAL_MAX_PROVIDER_CALLS,
  getKakaoBusanCollectionQueries,
} from "@/lib/kakao/collection/query-registry-v1";
import { BUSAN_REGION_CONFIG } from "@/lib/regions/config";

describe("Kakao Busan query registry V1", () => {
  it("contains exactly 31 stable queries for each of the 16 Busan districts", () => {
    expect(BUSAN_REGION_CONFIG.districts).toHaveLength(16);
    expect(KAKAO_BUSAN_QUERY_COUNT).toBe(496);
    expect(KAKAO_BUSAN_COLLECTION_QUERIES).toHaveLength(496);

    for (const district of BUSAN_REGION_CONFIG.districts) {
      const queries = getKakaoBusanCollectionQueries({
        districtCode: district.code,
      });
      expect(queries).toHaveLength(31);
      expect(new Set(queries.map(({ districtName }) => districtName))).toEqual(
        new Set([district.name]),
      );
    }
  });

  it("has no duplicate keys or query texts and uses the versioned key contract", () => {
    const keys = KAKAO_BUSAN_COLLECTION_QUERIES.map(({ key }) => key);
    const queryTexts = KAKAO_BUSAN_COLLECTION_QUERIES.map(
      ({ queryText }) => queryText,
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(queryTexts).size).toBe(queryTexts.length);
    expect(
      KAKAO_BUSAN_COLLECTION_QUERIES.every(
        ({ districtCode, family, key, registryVersion, templateIndex }) =>
          registryVersion === KAKAO_BUSAN_QUERY_REGISTRY_VERSION &&
          key === `kakao-busan-v1:${districtCode}:${family}:${templateIndex}`,
      ),
    ).toBe(true);
  });

  it("preserves the exact family and candidate-kind totals", () => {
    const expectedFamilyCounts = {
      general: 80,
      cafe: 48,
      food: 48,
      accommodation: 80,
      outdoor_leisure: 96,
      veterinary: 64,
      pet_shop: 80,
    } as const;
    for (const family of KAKAO_BUSAN_QUERY_FAMILIES) {
      expect(
        KAKAO_BUSAN_COLLECTION_QUERIES.filter(
          (query) => query.family === family,
        ),
      ).toHaveLength(expectedFamilyCounts[family]);
    }
    expect(
      getKakaoBusanCollectionQueries({
        candidateKind: "pet_travel_candidate",
      }),
    ).toHaveLength(352);
    expect(
      getKakaoBusanCollectionQueries({ candidateKind: "veterinary" }),
    ).toHaveLength(64);
    expect(
      getKakaoBusanCollectionQueries({ candidateKind: "pet_shop" }),
    ).toHaveLength(80);
  });

  it("uses category-group codes only as the specified supporting filters", () => {
    const count = (code: "CE7" | "FD6" | "AD5" | "AT4") =>
      KAKAO_BUSAN_COLLECTION_QUERIES.filter(
        ({ categoryGroupCode }) => categoryGroupCode === code,
      ).length;
    expect(count("CE7")).toBe(48);
    expect(count("FD6")).toBe(48);
    expect(count("AD5")).toBe(64);
    expect(count("AT4")).toBe(16);
    expect(
      KAKAO_BUSAN_COLLECTION_QUERIES.find(
        ({ queryText }) => queryText === "부산 수영구 애견동반 캠핑장",
      ),
    ).not.toHaveProperty("categoryGroupCode");
    expect(
      KAKAO_BUSAN_COLLECTION_QUERIES.filter(
        ({ candidateKind }) => candidateKind !== "pet_travel_candidate",
      ).every(({ categoryGroupCode }) => categoryGroupCode === undefined),
    ).toBe(true);
  });

  it("stays below the physical 1500-call cap at three public Kakao pages per query", () => {
    expect(KAKAO_BUSAN_MAX_PAGES_PER_QUERY).toBe(3);
    expect(KAKAO_BUSAN_THEORETICAL_MAX_PROVIDER_CALLS).toBe(1_488);
    expect(KAKAO_BUSAN_THEORETICAL_MAX_PROVIDER_CALLS).toBeLessThanOrEqual(
      1_500,
    );
  });
});
