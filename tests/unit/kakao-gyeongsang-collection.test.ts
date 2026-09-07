import { expect, it } from "vitest";
import { capitalRegionQueries } from "@/lib/kakao/collection/query-registry-capital-v1";
import { getRegionConfig } from "@/lib/regions/config";
import { validateKakaoBusanCollectionResult } from "@/lib/kakao/collection/validation";

it.each(["gyeongbuk", "gyeongnam"] as const)("shows %s stored candidates without live discovery", id => {
  const region = getRegionConfig(id);
  expect(region.allowedMapProviders).toEqual(["tour", "kakao"]);
  expect(region.mapCatalog.defaultProviders).toEqual(["tour", "kakao"]);
  expect(region.kakaoDiscoveryEnabled).toBe(false);
});

it.each([["gyeongbuk", 682, 22], ["gyeongnam", 558, 18]] as const)("plans current %s districts without retired cities", (id, count, districts) => {
  const queries = capitalRegionQueries(id);
  expect(queries).toHaveLength(count);
  expect(new Set(queries.map(q => q.key)).size).toBe(count);
  expect(new Set(queries.map(q => q.districtCode)).size).toBe(districts);
  expect(queries.some(q => ["군위군", "마산시", "진해시"].includes(q.districtName))).toBe(false);
});

it.each([
  ["gyeongbuk", "023", "경상북도 포항시 북구 중앙로 1", 36.04, 129.36],
  ["gyeongnam", "016", "경남 창원시 마산합포구 중앙로 1", 35.2, 128.57],
] as const)("accepts %s but rejects neighbouring metropolitan cities", (id, code, address, latitude, longitude) => {
  const region = getRegionConfig(id);
  const result = { id: "123", name: "카페", address, coordinates: { latitude, longitude } };
  expect(validateKakaoBusanCollectionResult(result, code, region).accepted).toBe(true);
  expect(validateKakaoBusanCollectionResult({ ...result, address: "대구광역시 군위군 군위읍 1" }, code, region).accepted).toBe(false);
  expect(validateKakaoBusanCollectionResult({ ...result, address: "부산광역시 강서구 중앙로 1" }, code, region).accepted).toBe(false);
  expect(validateKakaoBusanCollectionResult({ ...result, coordinates: { latitude: 33.5, longitude: 126.5 } }, code, region).accepted).toBe(false);
});
