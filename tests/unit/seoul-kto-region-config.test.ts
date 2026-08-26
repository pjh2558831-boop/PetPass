import { describe, expect, it } from "vitest";

import {
  BUSAN_REGION_CONFIG,
  JEJU_REGION_CONFIG,
  SEOUL_REGION_CONFIG,
  getItineraryEnabledRegionConfigs,
  getKakaoDiscoveryEnabledRegionConfigs,
  getKtoCollectionEnabledRegionConfig,
  getMapEnabledRegionConfigs,
  getRegionConfigByService2LegalDongCode,
} from "@/lib/regions/config";

const SEOUL_DISTRICTS = [
  ["110", "종로구"],
  ["140", "중구"],
  ["170", "용산구"],
  ["200", "성동구"],
  ["215", "광진구"],
  ["230", "동대문구"],
  ["260", "중랑구"],
  ["290", "성북구"],
  ["305", "강북구"],
  ["320", "도봉구"],
  ["350", "노원구"],
  ["380", "은평구"],
  ["410", "서대문구"],
  ["440", "마포구"],
  ["470", "양천구"],
  ["500", "강서구"],
  ["530", "구로구"],
  ["545", "금천구"],
  ["560", "영등포구"],
  ["590", "동작구"],
  ["620", "관악구"],
  ["650", "서초구"],
  ["680", "강남구"],
  ["710", "송파구"],
  ["740", "강동구"],
] as const;

describe("Seoul regional KTO foundation", () => {
  it("stores the audited Service2 identity and all 25 authoritative districts", () => {
    expect(SEOUL_REGION_CONFIG).toMatchObject({
      id: "seoul",
      displayName: "서울",
      providerCodes: {
        korPetTourService2: { legalDongRegionCode: "11" },
      },
    });
    expect(
      SEOUL_REGION_CONFIG.districts.map(({ legalDongDistrictCode, name }) => [
        legalDongDistrictCode,
        name,
      ]),
    ).toEqual(SEOUL_DISTRICTS);
    expect(new Set(SEOUL_REGION_CONFIG.districts.map(({ legalDongDistrictCode }) =>
      legalDongDistrictCode)).size).toBe(25);
    expect(getRegionConfigByService2LegalDongCode("11")?.id).toBe("seoul");
  });

  it("exposes the Phase 3 map-only capability matrix", () => {
    expect(BUSAN_REGION_CONFIG).toMatchObject({
      mapEnabled: true,
      ktoCatalogEnabled: true,
      itineraryEnabled: true,
      kakaoDiscoveryEnabled: true,
      allowedMapProviders: ["tour", "kakao"],
    });
    expect(JEJU_REGION_CONFIG).toMatchObject({
      mapEnabled: true,
      ktoCatalogEnabled: true,
      itineraryEnabled: false,
      kakaoDiscoveryEnabled: false,
      allowedMapProviders: ["tour"],
    });
    expect(SEOUL_REGION_CONFIG).toMatchObject({
      mapEnabled: true,
      ktoCatalogEnabled: true,
      itineraryEnabled: false,
      kakaoDiscoveryEnabled: false,
      allowedMapProviders: ["tour"],
      mapCatalog: {
        defaultProviders: ["tour"],
        fallbackSource: "public_catalog",
        snapshotCategories: null,
        availableCategories: ["attraction", "food", "cafe", "accommodation", "shopping"],
        deferredCategories: [],
        hideMissingPhoneOnDetail: true,
      },
    });

    expect(getMapEnabledRegionConfigs().map(({ id }) => id)).toEqual([
      "busan",
      "jeju",
      "seoul",
    ]);
    expect(getItineraryEnabledRegionConfigs().map(({ id }) => id)).toEqual([
      "busan",
    ]);
    expect(getKakaoDiscoveryEnabledRegionConfigs().map(({ id }) => id)).toEqual([
      "busan",
    ]);
  });

  it("keeps district-code collisions scoped by region identity", () => {
    expect(BUSAN_REGION_CONFIG.districts.find(({ legalDongDistrictCode }) =>
      legalDongDistrictCode === "110")?.name).toBe("중구");
    expect(JEJU_REGION_CONFIG.districts.find(({ legalDongDistrictCode }) =>
      legalDongDistrictCode === "110")?.name).toBe("제주시");
    expect(SEOUL_REGION_CONFIG.districts.find(({ legalDongDistrictCode }) =>
      legalDongDistrictCode === "110")?.name).toBe("종로구");
  });

  it("declares bounded, provider-specific collection metadata and isolated caches", () => {
    const jeju = getKtoCollectionEnabledRegionConfig("jeju");
    const seoul = getKtoCollectionEnabledRegionConfig("seoul");

    expect(jeju?.ktoCollection).toMatchObject({
      provider: "tour",
      listOperation: "areaBasedList2",
      registryVersion: "tour-jeju-service2-v1",
      cacheNamespace: "tour-jeju-service2-v1",
    });
    expect(seoul?.ktoCollection).toMatchObject({
      provider: "tour",
      listOperation: "areaBasedList2",
      registryVersion: "tour-seoul-service2-v1",
      cacheNamespace: "tour-seoul-service2-v1",
      acceptedContentTypeIds: ["12", "14", "15", "28", "32", "39"],
      limits: {
        listPageSize: 500,
        maxAcceptedRecords: 100,
      },
    });
    expect(jeju?.ktoCollection?.cacheNamespace).not.toBe(
      seoul?.ktoCollection?.cacheNamespace,
    );
    expect(getKtoCollectionEnabledRegionConfig("busan")).toBeNull();
    expect(getKtoCollectionEnabledRegionConfig("unknown")).toBeNull();
  });
});
