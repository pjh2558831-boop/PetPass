import { describe, expect, it } from "vitest";
import {
  classifyMajorRetailComplex,
  removeMajorRetailComplexTenants,
} from "@/lib/places/major-retail-complex";

describe("major retail complex normalization", () => {
  it("keeps one parent facility and removes its internal stores", () => {
    const places = [
      { id: "parent", name: "롯데백화점 부산본점", address: "부산 부산진구 가야대로 772", category: "shopping" },
      { id: "duplicate-parent", name: "롯데백화점  부산본점", address: "부산 부산진구 가야대로 772", category: "shopping" },
      { id: "cafe", name: "카페온 롯데백화점 부산본점", address: "부산 부산진구 가야대로 772 4층", category: "cafe" },
      { id: "food", name: "키친 롯데백화점 부산본점", address: "부산 부산진구 가야대로 772 9층", category: "food" },
    ];

    expect(removeMajorRetailComplexTenants(places)).toEqual([places[0]]);
  });

  it("hides a proven tenant even when the parent row is absent", () => {
    expect(removeMajorRetailComplexTenants([
      { id: "tenant", name: "베이커리", address: "서울특별시 중구 신세계백화점 본점 지하 1층", category: "cafe" },
    ])).toEqual([]);
  });

  it("does not exclude independent places from a brand-name coincidence", () => {
    for (const place of [
      { name: "현대옥 전주본점", address: "전북 전주시 완산구", category: "food" },
      { name: "롯데호텔 서울", address: "서울 중구 을지로", category: "accommodation" },
      { name: "신세계로 공원", address: "부산 기장군 신세계로 10", category: "attraction" },
    ]) {
      expect(classifyMajorRetailComplex(place)).toBe("independent");
    }
  });

  it("recognizes nationwide department-store and outlet operators", () => {
    expect(classifyMajorRetailComplex({ name: "현대백화점 판교점", address: "경기 성남시", category: "shopping" })).toBe("parent");
    expect(classifyMajorRetailComplex({ name: "식당 현대프리미엄아울렛 김포점", address: "경기 김포시 3층", category: "food" })).toBe("tenant");
    expect(classifyMajorRetailComplex({ name: "신세계백화점 센텀시티점", address: "부산 해운대구", category: "shopping" })).toBe("parent");
  });
});
