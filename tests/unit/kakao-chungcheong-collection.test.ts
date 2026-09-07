import { expect, it } from "vitest";
import { capitalRegionQueries } from "@/lib/kakao/collection/query-registry-capital-v1";
import { getRegionConfig } from "@/lib/regions/config";
import { validateKakaoBusanCollectionResult } from "@/lib/kakao/collection/validation";

it.each(["chungbuk", "chungnam"] as const)("enables only stored Kakao map candidates for %s", id => {
  const region = getRegionConfig(id);
  expect(region.allowedMapProviders).toEqual(["tour", "kakao"]);
  expect(region.mapCatalog.defaultProviders).toEqual(["tour", "kakao"]);
  expect(region.kakaoDiscoveryEnabled).toBe(false);
});

it.each([["chungbuk", 341, 11], ["chungnam", 465, 15]] as const)("plans current %s districts without obsolete Cheongwon", (id, count, districts) => {
  const queries = capitalRegionQueries(id);
  expect(queries).toHaveLength(count);
  expect(new Set(queries.map(q => q.key)).size).toBe(count);
  expect(new Set(queries.map(q => q.districtCode)).size).toBe(districts);
  expect(queries.some(q => q.districtName === "청원군")).toBe(false);
});

it.each([
  ["chungbuk", "010", "충청북도 청주시 청원구 상당로 1", 36.65, 127.49],
  ["chungnam", "012", "충남 천안시 서북구 불당로 1", 36.81, 127.11],
] as const)("validates %s addresses and coordinates without crossing regional boundaries", (id, code, address, latitude, longitude) => {
  const region = getRegionConfig(id);
  const result = { id: "123", name: "카페", address, coordinates: { latitude, longitude } };
  expect(validateKakaoBusanCollectionResult(result, code, region).accepted).toBe(true);
  expect(validateKakaoBusanCollectionResult({ ...result, address: "세종특별자치시 한누리대로 1" }, code, region).accepted).toBe(false);
  expect(validateKakaoBusanCollectionResult({ ...result, coordinates: { latitude: 33.5, longitude: 126.5 } }, code, region).accepted).toBe(false);
});
