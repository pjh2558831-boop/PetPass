import { expect, it } from "vitest";
import { getRegionConfig } from "@/lib/regions/config";
import { capitalRegionQueries } from "@/lib/kakao/collection/query-registry-capital-v1";
import { validateKakaoBusanCollectionResult } from "@/lib/kakao/collection/validation";

it("shows the Gangwon stored Kakao catalog without enabling live discovery", () => {
  const region = getRegionConfig("gangwon");
  expect(region.allowedMapProviders).toEqual(["tour", "kakao"]);
  expect(region.mapCatalog.defaultProviders).toEqual(["tour", "kakao"]);
  expect(region.kakaoDiscoveryEnabled).toBe(false);
  expect(getRegionConfig("daejeon").allowedMapProviders).toEqual(["tour", "kakao"]);
});

it("plans 558 stable queries across all 18 Gangwon districts", () => {
  const queries = capitalRegionQueries("gangwon");
  expect(queries).toHaveLength(558);
  expect(new Set(queries.map(q => q.key)).size).toBe(558);
  expect(new Set(queries.map(q => q.districtCode)).size).toBe(18);
  expect(queries.every(q => q.queryText.startsWith("강원 "))).toBe(true);
});

it.each(["강원", "강원도", "강원특별자치도"])("accepts %s but rejects same-named Goseong outside Gangwon", prefix => {
  const region = getRegionConfig("gangwon");
  const result = { id: "123", name: "카페", address: `${prefix} 고성군 토성면 1`, coordinates: { latitude: 38.3, longitude: 128.5 } };
  expect(validateKakaoBusanCollectionResult(result, "002", region).accepted).toBe(true);
  expect(validateKakaoBusanCollectionResult({ ...result, address: "경남 고성군 고성읍 1" }, "002", region).accepted).toBe(false);
  expect(validateKakaoBusanCollectionResult({ ...result, coordinates: { latitude: 35, longitude: 128.5 } }, "002", region).accepted).toBe(false);
  expect(validateKakaoBusanCollectionResult(result, "001", region).accepted).toBe(false);
});
