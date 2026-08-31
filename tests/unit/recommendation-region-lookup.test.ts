import { describe, expect, it, vi } from "vitest";
import {
  getKtoRegionLookupIdentity,
  getRegionConfig,
  matchesKtoRegionIdentity,
  resolveRegionDistrictCode,
} from "@/lib/regions/config";
import { collectTourCatalog } from "@/lib/tour-api/catalog-service";
import { findPublishedSelectedMarkerV2 } from "@/lib/recommendation/v2/hybrid-selection";
import type { MapPlacesSnapshotMarker } from "@/types/map-places-snapshot";
import type { TourPlaceService } from "@/lib/tour-api/service";

describe.each([
  ["gwangju", "5", "29"],
  ["sejong", "8", "36"],
  ["jeonnam", "38", "46"],
] as const)("%s KTO lookup identity", (regionId, areaCode, legalRegionCode) => {
  it("keeps areaCode and legal administrative identity distinct", () => {
    const region = getRegionConfig(regionId);
    const firstDistrict = region.districts[0]!;
    const lookup = getKtoRegionLookupIdentity(region, firstDistrict.legalDongDistrictCode);

    expect(lookup).toMatchObject({
      internalRegionId: regionId,
      areaCode,
      legalRegionCode,
      geographicBoundary: region.mapBounds,
      routeCapabilities: region.routeCapabilities,
      district: {
        stableCode: firstDistrict.legalDongDistrictCode,
        areaCodes: firstDistrict.collectionAreaDistrictCodes,
      },
    });
    expect(resolveRegionDistrictCode(region, {
      legalRegionCode,
      areaCode,
      legalDistrictCode: null,
      areaDistrictCode: firstDistrict.collectionAreaDistrictCodes?.[0] ?? null,
    })).toBe(firstDistrict.legalDongDistrictCode);
  });
});

describe("strict regional identity", () => {
  it("rejects conflicting provider region identities even when one code matches", () => {
    const gwangju = getRegionConfig("gwangju");
    expect(matchesKtoRegionIdentity(gwangju, {
      legalRegionCode: "50",
      areaCode: "5",
    })).toBe(false);
  });

  it("queries areaBasedList2 by KTO areaCode while visibility remains on legal codes", async () => {
    const listPlaces = vi.fn(async () => ({
      places: [], page: 1, pageSize: 50, totalCount: 0,
      source: { provider: "Korea Tourism Organization" as const, operation: "areaBasedList2" as const, retrievedAt: "2026-08-31T00:00:00.000Z" },
    }));
    const listProviderVisibility = vi.fn(async () => ({
      records: [], page: 1, pageSize: 50, totalCount: 0,
    }));
    const service = { listPlaces, listProviderVisibility } as unknown as TourPlaceService;
    const lookup = getKtoRegionLookupIdentity(getRegionConfig("gwangju"), "001");

    await collectTourCatalog(service, {
      regionCode: lookup.areaCode,
      districtCode: lookup.district?.areaCodes[0],
      administrativeCodeSystem: "area_code",
      visibilityRegionCode: lookup.legalRegionCode,
      visibilityDistrictCode: lookup.district?.legalCodes[0],
      contentTypeId: "12",
    });

    expect(listPlaces).toHaveBeenCalledWith(expect.objectContaining({
      regionCode: "5",
      districtCode: "1",
      administrativeCodeSystem: "area_code",
    }));
    expect(listProviderVisibility).toHaveBeenCalledWith(expect.objectContaining({
      regionCode: "29",
      districtCode: undefined,
    }));
  });
});

describe("published selected-place resolution", () => {
  it.each(["gwangju", "sejong", "jeonnam"] as const)(
    "resolves a %s place by stable provider identity and published region",
    (regionId) => {
      const marker: MapPlacesSnapshotMarker = {
        id: "tour:12345",
        providerPlaceId: "12345",
        regionId,
        dataset: "core",
        layer: "tourism",
        name: "공개 장소",
        category: "attraction",
        districtCode: null,
        coordinates: getRegionConfig(regionId).defaultMapCenter,
        petAccessVerdict: "conditional",
        publicLabel: "조건부 동반 가능",
        sourceLabel: "한국관광공사",
      };
      expect(findPublishedSelectedMarkerV2({
        placeId: marker.id,
        requestedRegionId: regionId,
        markers: [marker],
      })).toBe(marker);
      expect(findPublishedSelectedMarkerV2({
        placeId: marker.id,
        requestedRegionId: "busan",
        markers: [marker],
      })).toBeNull();
    },
  );
});
