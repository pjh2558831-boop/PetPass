import { expect, it } from "vitest";
import { capitalRegionQueries } from "@/lib/kakao/collection/query-registry-capital-v1";
import { getRegionConfig } from "@/lib/regions/config";
import { validateKakaoBusanCollectionResult } from "@/lib/kakao/collection/validation";

it.each([["daejeon",155],["daegu",279],["gwangju",155],["ulsan",155],["sejong",31]] as const)("plans %s without duplicate query keys",(id,count)=>{
  const queries=capitalRegionQueries(id);
  expect(queries).toHaveLength(count);
  expect(new Set(queries.map(q=>q.key)).size).toBe(count);
  if(id==="sejong") expect(queries[0].queryText).toBe("세종 애견동반");
});

it.each([
  ["daejeon","004","대전광역시 유성구 대학로 1",36.36,127.34],
  ["daegu","009","대구광역시 군위군 군위읍 중앙길 1",36.24,128.57],
  ["gwangju","004","전남광주통합특별시 북구 중앙로 1",35.18,126.91],
  ["ulsan","005","울산광역시 울주군 범서읍 천상길 1",35.56,129.23],
  ["sejong","001","세종특별자치시 한누리대로 1",36.48,127.29],
  ["sejong","001","세종 조치원읍 새내로 1",36.60,127.30],
] as const)("validates %s exact region addresses",(id,code,address,latitude,longitude)=>{
  const region=getRegionConfig(id);
  const place={id:"123",name:"카페",address,coordinates:{latitude,longitude}};
  expect(validateKakaoBusanCollectionResult(place,code,region).accepted).toBe(true);
  expect(validateKakaoBusanCollectionResult({...place,address:"경기 광주시 중앙로 1"},code,region).accepted).toBe(false);
  expect(validateKakaoBusanCollectionResult({...place,coordinates:{latitude:33.4,longitude:126.5}},code,region).accepted).toBe(false);
});

it.each(["daejeon","daegu","gwangju","ulsan","sejong"] as const)("shows %s stored Kakao candidates",id=>{
  expect(getRegionConfig(id).allowedMapProviders).toEqual(["tour","kakao"]);
  expect(getRegionConfig(id).kakaoDiscoveryEnabled).toBe(false);
});
