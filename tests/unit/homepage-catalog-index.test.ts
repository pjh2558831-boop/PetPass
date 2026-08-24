import { describe, expect, it } from "vitest";
import {
  getHomepageCatalogDatasets,
  homepageDatasetCacheKey,
} from "@/lib/homepage/catalog-datasets";
import {
  HomepageCatalogIndex,
  markerMatchesHomepageCatalogFilter,
  type HomepageCatalogFilter,
} from "@/lib/homepage/homepage-catalog-index";
import {
  BUSAN_REGION_CONFIG,
  JEJU_REGION_CONFIG,
  type RegionConfig,
} from "@/lib/regions/config";
import type { HomepageMapMarker } from "@/types/homepage-places";

function marker(index: number): HomepageMapMarker {
  const official = index % 3 === 0;
  return {
    id: `${official ? "tour" : "kakao"}:${index}`,
    layer: official ? "official" : "kakao_candidate",
    name: `장소 ${index}`,
    category: index % 2 === 0 ? "cafe" : "attraction",
    district: `district-${index % 7}`,
    address: `주소 ${index}`,
    coordinates: { latitude: 33 + (index % 100) / 1_000, longitude: 126 + (index % 100) / 1_000 },
    sourceLabel: official ? "한국관광공사" : "카카오 검색 후보",
    statusLabel: official ? "확인 필요" : "방문 전 확인 필요",
    isAllowed: false,
    href: null,
    imageUrl: null,
  };
}

describe("region-generic homepage catalog descriptors", () => {
  it("derives provider datasets from capabilities without a named-region branch", () => {
    expect(getHomepageCatalogDatasets(BUSAN_REGION_CONFIG).map(({ id }) => id)).toEqual([
      "default-tour", "default-kakao", "optional-veterinary", "optional-pet-shop",
    ]);
    expect(getHomepageCatalogDatasets(JEJU_REGION_CONFIG).map(({ id }) => id)).toEqual(["default-tour"]);
  });

  it("supports a synthetic future configuration through the same descriptor function", () => {
    const future = {
      ...JEJU_REGION_CONFIG,
      id: "future-test",
      displayName: "테스트 지역",
      kakaoDiscoveryEnabled: true,
    } satisfies RegionConfig<"future-test">;
    expect(getHomepageCatalogDatasets(future).map(({ id }) => id)).toContain("default-kakao");
  });

  it("isolates cache representation dimensions", () => {
    const dataset = getHomepageCatalogDatasets(BUSAN_REGION_CONFIG, "default")[0];
    const base = homepageDatasetCacheKey(BUSAN_REGION_CONFIG, dataset);
    expect(base).toContain("1:busan:default:default-tour:tour:all");
    expect(homepageDatasetCacheKey(JEJU_REGION_CONFIG, { ...dataset, categories: ["shopping"] }))
      .not.toBe(base);
    expect(homepageDatasetCacheKey(BUSAN_REGION_CONFIG, { ...dataset, scope: "optional" }))
      .not.toBe(base);
  });
});

describe("homepage catalog indexes", () => {
  it("matches the canonical predicate for combined provider/category/district filters", () => {
    const markers = Array.from({ length: 700 }, (_, index) => marker(index));
    const index = new HomepageCatalogIndex("busan", markers);
    const filter: HomepageCatalogFilter = {
      categories: ["cafe"],
      providers: ["kakao"],
      districts: ["district-2", "district-4"],
      datasets: ["default-kakao"],
    };
    const indexed = index.filter(filter);
    const canonical = markers.filter((value) => markerMatchesHomepageCatalogFilter(value, filter));
    expect(indexed.markers).toEqual(canonical);
    expect(indexed.inspectedIdCount).toBeLessThan(markers.length);
  });

  it.each([50, 700, 2_000, 5_000])("keeps %i-record filtering linear and bounded", (size) => {
    const markers = Array.from({ length: size }, (_, index) => marker(index));
    const startedAt = performance.now();
    const index = new HomepageCatalogIndex("busan", markers);
    const result = index.filter({ categories: ["cafe"], providers: ["kakao"] });
    const elapsed = performance.now() - startedAt;
    expect(result.inspectedIdCount).toBeLessThanOrEqual(Math.ceil(size / 2));
    expect(result.markers.every((value) => value.category === "cafe" && value.layer === "kakao_candidate"))
      .toBe(true);
    expect(elapsed).toBeLessThan(250);
  });

  it("preserves canonical marker object identities and ordering", () => {
    const markers = Array.from({ length: 50 }, (_, index) => marker(index));
    const result = new HomepageCatalogIndex("busan", markers).filter({ categories: ["cafe"] });
    expect(result.markers).toEqual(markers.filter(({ category }) => category === "cafe"));
    expect(result.markers[0]).toBe(markers[0]);
  });
});
