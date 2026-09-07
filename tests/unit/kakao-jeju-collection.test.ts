import { expect, it } from "vitest";
import { JEJU_REGION_CONFIG } from "@/lib/regions/config";
import { validateKakaoBusanCollectionResult } from "@/lib/kakao/collection/validation";
import { KAKAO_JEJU_COLLECTION_QUERIES as queries } from "@/lib/kakao/collection/query-registry-jeju-v1";

it("plans exactly 62 unique Jeju queries with 186 maximum initial calls", () => {
  expect(queries).toHaveLength(62);
  expect(new Set(queries.map(q => q.key)).size).toBe(62);
  for (const district of JEJU_REGION_CONFIG.districts) {
    expect(queries.filter(q => q.districtCode === district.legalDongDistrictCode)).toHaveLength(31);
  }
  expect(queries.every(q => q.queryText.startsWith("제주 ") && q.key.startsWith("kakao-jeju-v1:"))).toBe(true);
});

it("accepts exact Jeju districts and rejects conflicting addresses and mainland coordinates", () => {
  const place = { id: "123", name: "테스트 카페", address: "제주특별자치도 제주시 중앙로 1", categoryName: "음식점 > 카페", coordinates: { latitude: 33.5, longitude: 126.53 } };
  const validate = (value: typeof place, district = "110") => validateKakaoBusanCollectionResult(value, district, JEJU_REGION_CONFIG).accepted;
  expect(validate(place)).toBe(true);
  expect(validate({ ...place, address: "제주 서귀포시 중앙로 1" }, "130")).toBe(true);
  expect(validate(place, "130")).toBe(false);
  expect(validate({ ...place, address: "서울 제주시 중앙로 1" })).toBe(false);
  expect(validate({ ...place, coordinates: { latitude: 37.5, longitude: 126.9 } })).toBe(false);
  expect(validateKakaoBusanCollectionResult({ ...place, roadAddress: "제주 서귀포시 중앙로 1" }, "110", JEJU_REGION_CONFIG).accepted).toBe(false);
});
