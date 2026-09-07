import { expect, it } from "vitest";
import { capitalRegionQueries } from "@/lib/kakao/collection/query-registry-capital-v1";
import { getRegionConfig } from "@/lib/regions/config";
import { validateKakaoBusanCollectionResult } from "@/lib/kakao/collection/validation";

it.each(["jeonbuk","jeonnam"] as const)("shows %s stored candidates without live discovery",id=>{
  const region=getRegionConfig(id);
  expect(region.allowedMapProviders).toEqual(["tour","kakao"]);
  expect(region.mapCatalog.defaultProviders).toEqual(["tour","kakao"]);
  expect(region.kakaoDiscoveryEnabled).toBe(false);
});

it.each([["jeonbuk",434,14],["jeonnam",682,22]] as const)("plans all %s districts",(id,count,districts)=>{
  const queries=capitalRegionQueries(id);
  expect(queries).toHaveLength(count);
  expect(new Set(queries.map(q=>q.key)).size).toBe(count);
  expect(new Set(queries.map(q=>q.districtCode)).size).toBe(districts);
});

it.each([
  ["jeonbuk","012","전북특별자치도 전주시 완산구 중앙로 1",35.82,127.15],
  ["jeonbuk","002","전라북도 군산시 옥도면 어청도길 1",36.12,125.98],
  ["jeonnam","012","전라남도 신안군 흑산면 가거도길 1",34.05,125.13],
  ["jeonnam","008","전남광주통합특별시 목포시 해양대학로 59",34.79,126.37],
] as const)("validates %s mainland and island addresses",(id,code,address,latitude,longitude)=>{
  const region=getRegionConfig(id);
  const result={id:"123",name:"카페",address,coordinates:{latitude,longitude}};
  expect(validateKakaoBusanCollectionResult(result,code,region).accepted).toBe(true);
  expect(validateKakaoBusanCollectionResult({...result,address:"광주광역시 북구 중앙로 1"},code,region).accepted).toBe(false);
  expect(validateKakaoBusanCollectionResult({...result,address:"전남광주통합특별시 북구 중앙로 1"},code,region).accepted).toBe(false);
  expect(validateKakaoBusanCollectionResult({...result,coordinates:{latitude:33.4,longitude:126.5}},code,region).accepted).toBe(false);
});
