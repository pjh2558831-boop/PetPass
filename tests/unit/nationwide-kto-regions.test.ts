import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  REGION_CONFIGS,
  getKtoCollectionEnabledRegionConfig,
} from "@/lib/regions/config";
import {
  REGION_SELECTOR_GROUPS,
  filterRegionSelectorOptions,
} from "@/lib/regions/selector";
import { collectKtoCatalog } from "@/lib/tour-api/collection/runner";
import {
  parsePublicCatalogUrlState,
  resolvePublicCatalogDistrictQuery,
} from "@/lib/map-places/catalog-url";
import type { KtoCatalogProvider } from "@/lib/tour-api/collection/contracts";
import type { TourPlaceSummary } from "@/types/place";
import { REGION_IDS, type RegionId } from "@/types/region";

const EXPECTED_REGION_CODES = [
  ["seoul", "1"],
  ["incheon", "2"],
  ["daejeon", "3"],
  ["daegu", "4"],
  ["gwangju", "5"],
  ["busan", "6"],
  ["ulsan", "7"],
  ["sejong", "8"],
  ["gyeonggi", "31"],
  ["gangwon", "32"],
  ["chungbuk", "33"],
  ["chungnam", "34"],
  ["gyeongbuk", "35"],
  ["gyeongnam", "36"],
  ["jeonbuk", "37"],
  ["jeonnam", "38"],
  ["jeju", "39"],
] as const;

describe("nationwide KTO regional coverage", () => {
  it("registers the exact 17 stable region keys in the approved order", () => {
    expect(REGION_IDS).toEqual(EXPECTED_REGION_CODES.map(([id]) => id));
    expect(REGION_CONFIGS.map(({ id, providerCodes }) => [
      id,
      providerCodes.legacyTourismAreaCode,
    ])).toEqual(EXPECTED_REGION_CODES);
    expect(new Set(REGION_CONFIGS.map(({ ktoCollection }) =>
      ktoCollection?.cacheNamespace)).size).toBe(17);
  });

  it("keeps the compact selector grouped and searchable by full or common names", () => {
    expect(REGION_SELECTOR_GROUPS.map(({ label, regionIds }) => [label, regionIds]))
      .toEqual([
        ["수도권", ["seoul", "gyeonggi", "incheon"]],
        ["광역시", ["busan", "daegu", "gwangju", "daejeon", "ulsan", "sejong"]],
        ["도 지역", ["gangwon", "chungbuk", "chungnam", "jeonbuk", "jeonnam", "gyeongbuk", "gyeongnam", "jeju"]],
      ]);
    expect(filterRegionSelectorOptions("충청남도").map(({ id }) => id))
      .toEqual(["chungnam"]);
    expect(filterRegionSelectorOptions("경남").map(({ id }) => id))
      .toEqual(["gyeongnam"]);
    expect(filterRegionSelectorOptions("세종특별자치시").map(({ id }) => id))
      .toEqual(["sejong"]);
  });

  it("keeps every new areaCode2 district registry addressable and region-isolated", () => {
    const expectedDistrictCounts = new Map<RegionId, number>([
      ["daejeon", 5], ["daegu", 9], ["gwangju", 5], ["ulsan", 5],
      ["sejong", 1], ["gangwon", 18], ["chungbuk", 12], ["chungnam", 15],
      ["gyeongbuk", 22], ["gyeongnam", 20], ["jeonbuk", 14], ["jeonnam", 22],
    ]);
    for (const [regionId, count] of expectedDistrictCounts) {
      const region = getKtoCollectionEnabledRegionConfig(regionId);
      expect(region?.ktoCollection.administrativeCodeSystem).toBe("area_code");
      expect(region?.districts).toHaveLength(count);
      expect(region?.districts.every(({ collectionAreaDistrictCodes }) =>
        collectionAreaDistrictCodes?.length === 1)).toBe(true);
      const first = region?.districts[0];
      expect(parsePublicCatalogUrlState({
        region: regionId,
        district: first?.legalDongDistrictCode,
      })).toMatchObject({
        region: regionId,
        district: first?.legalDongDistrictCode,
      });
      expect(resolvePublicCatalogDistrictQuery(regionId, first?.name ?? ""))
        .toBe(first?.legalDongDistrictCode);
    }
  });

  it("defines one additive nationwide migration for the registry and other category", () => {
    const sql = readFileSync(
      "supabase/migrations/20260828091009_add_nationwide_kto_catalog.sql",
      "utf8",
    );
    for (const [regionId] of EXPECTED_REGION_CODES.slice(2, -1)) {
      if (["busan", "incheon", "gyeonggi"].includes(regionId)) continue;
      expect(sql).toContain(`('${regionId}',`);
    }
    expect(sql).toContain("category_group = 'other'");
    expect(sql).toContain("alter column content_type_id drop not null");
    expect(sql).not.toMatch(/drop\s+table|truncate|delete\s+from/iu);
  });

  it("exhausts pagination and preserves unknown non-Shopping types as core other", async () => {
    const base = getKtoCollectionEnabledRegionConfig("daejeon");
    expect(base).not.toBeNull();
    if (!base) return;
    const region = {
      ...base,
      districts: [base.districts[0]],
      ktoCollection: {
        ...base.ktoCollection,
        limits: {
          ...base.ktoCollection.limits,
          listPageSize: 1,
          maxRawRecords: 10,
          maxRawRecordsPerDistrict: 10,
          maxAcceptedRecords: 10,
          maxDetailedRecords: 1,
        },
      },
    };
    const district = region.districts[0];
    const pages: number[] = [];
    const provider: KtoCatalogProvider = {
      async listDistrict(input) {
        pages.push(input.page);
        const contentId = String(90_000 + input.page);
        const summary: TourPlaceSummary = {
          contentId,
          contentTypeId: null,
          providerContentTypeId: input.page === 5 ? null : "99",
          category: "unknown",
          title: input.page === 4 ? null : `미분류 장소 ${input.page}`,
          address: `${region.ktoCollection.administrativeAddressPrefixes.at(-1)} ${district.name} 테스트로 1`,
          detailAddress: null,
          longitude: region.defaultMapCenter.longitude,
          latitude: region.defaultMapCenter.latitude,
          phone: null,
          thumbnailUrl: null,
          imageUrl: null,
          copyrightType: null,
          createdTime: null,
          modifiedTime: null,
          legalRegionCode: null,
          legalDistrictCode: null,
          areaCode: region.providerCodes.legacyTourismAreaCode,
          sigunguCode: district.collectionAreaDistrictCodes?.[0] ?? null,
          classificationCodes: {
            primary: null,
            secondary: null,
            tertiary: null,
            largeCategory: null,
            middleCategory: null,
            smallCategory: null,
          },
          source: {
            provider: "Korea Tourism Organization",
            operation: "areaBasedList2",
            retrievedAt: "2026-08-28T00:00:00.000Z",
            contentId,
            providerModifiedTime: null,
          },
        };
        return {
          records: [{
            summary,
            authoritativeLegalRegionCode: null,
            authoritativeLegalDistrictCode: null,
            authoritativeAreaRegionCode: input.page === 3 ? null : summary.areaCode,
            authoritativeAreaDistrictCode: input.page === 3 ? null : summary.sigunguCode,
          }],
          page: input.page,
          pageSize: 1,
          totalCount: 5,
        };
      },
      async getPlaceDetail() {
        throw new Error("Unknown content types must remain list-only.");
      },
    };

    const result = await collectKtoCatalog({ region, provider });
    expect(pages).toEqual([1, 2, 3, 4, 5]);
    expect(result.rows).toHaveLength(5);
    expect(result.rows.every((row) =>
      row.catalog_dataset === "core" &&
      row.evidence_collection_mode === "list_only" &&
      row.category_group === "other")).toBe(true);
    expect(result.rows.map(({ content_type_id }) => content_type_id))
      .toEqual([99, 99, 99, 99, null]);
    expect(result.rows[3]?.name).toBe("이름 확인 필요 (90004)");
  });
});
