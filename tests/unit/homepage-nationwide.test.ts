import { HOMEPAGE_MAP_REGIONS, homepageRegionForViewport } from "@/lib/homepage/nationwide";
import { describe, expect, it } from "vitest";
import { loadNationwideSnapshots, projectNationwideMarker } from "@/lib/homepage/nationwide";
import type { MapPlacesSnapshot, MapPlacesSnapshotMarker } from "@/types/map-places-snapshot";

describe("nationwide homepage", () => {
  it("loads every region with at most two requests and retains successes after a failure", async () => {
    let active = 0;
    let peak = 0;
    const completed: string[] = [];
    const failed: string[] = [];
    await loadNationwideSnapshots(["busan", "seoul", "jeju"], new AbortController().signal,
      (region) => completed.push(region), (region) => failed.push(region),
      async (region) => {
        peak = Math.max(peak, ++active);
        await Promise.resolve();
        active--;
        if (region === "seoul") throw new Error("unavailable");
        return { region, items: [] } as unknown as MapPlacesSnapshot;
      });
    expect(peak).toBe(2);
    expect(completed.sort()).toEqual(["busan", "jeju"]);
    expect(failed).toEqual(["seoul"]);
  });

  it("preserves regional identity and conditional Kakao warnings without declaring unrestricted access", () => {
    const marker = projectNationwideMarker({
      id: "kakao:123", providerPlaceId: "123", regionId: "seoul", name: "조건부 카페",
      layer: "kakao", category: "cafe", districtCode: null,
      coordinates: { latitude: 37.56, longitude: 126.97 },
      petAccessVerdict: "conditional", publicLabel: "조건 확인 필요", petConditions: "테라스만 가능",
      sourceLabel: "카카오 검색 후보",
    } satisfies MapPlacesSnapshotMarker);
    expect(marker?.regionId).toBe("seoul");
    expect(marker?.isAllowed).toBe(false);
    expect(marker?.statusLabel).toContain("방문 전 확인");
    expect(marker?.statusLabel).toContain("테라스만 가능");
    expect(marker?.href).toBe("https://place.map.kakao.com/123");
  });
});


it("selects only a zoomed region and keeps wide/nationwide views unloaded", () => {
  for (const region of HOMEPAGE_MAP_REGIONS) {
    const viewport = { center: region.defaultMapCenter, rectangle: region.mapBounds, radiusMeters: 10000 };
    expect(homepageRegionForViewport(viewport, 10)).toBe(region.id);
    expect(homepageRegionForViewport(viewport, 12)).toBeNull();
  }
  expect(homepageRegionForViewport({ center: { latitude: 0, longitude: 0 }, rectangle: { west: -1, east: 1, north: 1, south: -1 }, radiusMeters: 1000 }, 8)).toBeNull();
});
