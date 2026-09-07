import { expect, it } from "vitest";
import { getRegionConfig } from "@/lib/regions/config";
import { validateKakaoBusanCollectionResult } from "@/lib/kakao/collection/validation";
import { capitalRegionQueries } from "@/lib/kakao/collection/query-registry-capital-v1";

it.each([["gyeonggi", 961], ["incheon", 341]] as const)("builds the complete stable %s query plan", (region, count) => {
  const queries = capitalRegionQueries(region);
  expect(queries).toHaveLength(count);
  expect(new Set(queries.map(q => q.key)).size).toBe(count);
  expect(queries.every(q => q.key.startsWith(`kakao-${region}-v1:`))).toBe(true);
});

it.each([
  ["gyeonggi", "110", "경기도 수원시 영통구 광교로 1", 37.28, 127.04],
  ["incheon", "275", "인천광역시 서해구 서곶로 1", 37.54, 126.67],
] as const)("validates %s independently of search words", (id, district, address, latitude, longitude) => {
  const region = getRegionConfig(id);
  const result = { id: "123", name: "카페", address, categoryName: "음식점 > 카페", coordinates: { latitude, longitude } };
  expect(validateKakaoBusanCollectionResult(result, district, region).accepted).toBe(true);
  expect(validateKakaoBusanCollectionResult({ ...result, address: "서울 중구 중앙로 1" }, district, region).accepted).toBe(false);
  expect(validateKakaoBusanCollectionResult({ ...result, coordinates: { latitude: 33.5, longitude: 126.5 } }, district, region).accepted).toBe(false);
});
