import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  GYEONGGI_REGION_CONFIG,
  INCHEON_REGION_CONFIG,
  getKtoCollectionEnabledRegionConfig,
  getMapEnabledRegionConfigs,
  getRegionConfigByService2LegalDongCode,
  type KtoCollectionEnabledRegionConfig,
} from "@/lib/regions/config";
import {
  parsePublicCatalogUrlState,
  resolvePublicCatalogDistrictQuery,
  serializeResultsUrl,
} from "@/lib/map-places/catalog-url";
import { collectKtoCatalog } from "@/lib/tour-api/collection/runner";
import { parseKtoCatalogCliArgs } from "@/lib/tour-api/collection/cli";
import type {
  KtoCatalogProvider,
  KtoProviderRequestAudit,
} from "@/lib/tour-api/collection/contracts";
import type { TourPlaceDetail, TourPlaceSummary } from "@/types/place";

const INCHEON_DISTRICTS = [
  ["125", "제물포구"],
  ["155", "영종구"],
  ["177", "미추홀구"],
  ["185", "연수구"],
  ["200", "남동구"],
  ["237", "부평구"],
  ["245", "계양구"],
  ["275", "서해구"],
  ["290", "검단구"],
  ["710", "강화군"],
  ["720", "옹진군"],
] as const;

const GYEONGGI_DISTRICTS = [
  ["110", "수원시"], ["130", "성남시"], ["150", "의정부시"],
  ["170", "안양시"], ["190", "부천시"], ["210", "광명시"],
  ["220", "평택시"], ["250", "동두천시"], ["270", "안산시"],
  ["280", "고양시"], ["290", "과천시"], ["310", "구리시"],
  ["360", "남양주시"], ["370", "오산시"], ["390", "시흥시"],
  ["410", "군포시"], ["430", "의왕시"], ["450", "하남시"],
  ["460", "용인시"], ["480", "파주시"], ["500", "이천시"],
  ["550", "안성시"], ["570", "김포시"], ["590", "화성시"],
  ["610", "광주시"], ["630", "양주시"], ["650", "포천시"],
  ["670", "여주시"], ["800", "연천군"], ["820", "가평군"],
  ["830", "양평군"],
] as const;

function summary(
  region: KtoCollectionEnabledRegionConfig<string>,
  district: KtoCollectionEnabledRegionConfig<string>["districts"][number],
  providerDistrictCode: string,
  contentTypeId: "12" | "38",
  suffix: string,
): TourPlaceSummary {
  const coordinates = region.defaultMapCenter;
  const contentId = `${region.providerCodes.korPetTourService2.legalDongRegionCode}${providerDistrictCode}${suffix}`;
  return {
    contentId,
    contentTypeId,
    providerContentTypeId: contentTypeId,
    category: contentTypeId === "38" ? "shopping" : "attraction",
    title: `${region.displayName} ${district.name} ${suffix}`,
    address: `${region.ktoCollection.administrativeAddressPrefixes.at(-1)} ${district.name} 테스트로 1`,
    detailAddress: null,
    longitude: coordinates.longitude,
    latitude: coordinates.latitude,
    phone: null,
    thumbnailUrl: null,
    imageUrl: null,
    copyrightType: null,
    createdTime: "20260101000000",
    modifiedTime: "20260827000000",
    legalRegionCode: region.providerCodes.korPetTourService2.legalDongRegionCode,
    legalDistrictCode: providerDistrictCode,
    classificationCodes: {
      primary: "A01", secondary: "A0101", tertiary: "A01010100",
      largeCategory: "AC", middleCategory: "AC01", smallCategory: "AC0101",
    },
    source: {
      provider: "Korea Tourism Organization",
      operation: "areaBasedList2",
      retrievedAt: "2026-08-27T00:00:00.000Z",
      contentId,
      providerModifiedTime: "20260827000000",
    },
  };
}

function detail(value: TourPlaceSummary): TourPlaceDetail {
  return {
    summary: { ...value, source: { ...value.source, operation: "detailCommon2" } },
    overview: null,
    homepageUrl: null,
    operatingInformation: null,
    checkInTime: null,
    checkOutTime: null,
    restDayInformation: null,
    parkingInformation: null,
    reservationInformation: null,
    contactInformation: null,
    providerModifiedTime: value.modifiedTime,
    petPolicyEvidence: null,
    normalizedPetEvidence: {
      availability: "absent",
      fields: {
        acmpyTypeCd: null, acmpyPsblCpam: null, acmpyNeedMtr: null,
        etcAcmpyInfo: null, relaAcdntRiskMtr: null, relaPosesFclty: null,
        relaFrnshPrdlst: null, relaPurcPrdlst: null, relaRntlPrdlst: null,
      },
      sourceFields: [], emptyFieldNames: [], absentFieldNames: [], warningCodes: [],
    },
    introPetPolicyEvidence: null,
    sections: {
      common: { status: "available" },
      intro: { status: "available" },
      petPolicy: { status: "available" },
    },
    source: {
      provider: "Korea Tourism Organization",
      operation: "detailCommon2",
      contentId: value.contentId,
      retrievedAt: "2026-08-27T00:00:00.000Z",
      providerModifiedTime: value.modifiedTime,
    },
  };
}

function providerFor(region: KtoCollectionEnabledRegionConfig<string>) {
  const providerDistricts = region.districts.flatMap((district) =>
    (district.collectionLegalDongDistrictCodes ?? [district.legalDongDistrictCode])
      .map((providerDistrictCode) => ({ district, providerDistrictCode })));
  const core = new Map(providerDistricts.map(({ district, providerDistrictCode }, index) => [
    providerDistrictCode,
    summary(region, district, providerDistrictCode, "12", String(10_000 + index)),
  ]));
  const shopping = new Map(providerDistricts.map(({ district, providerDistrictCode }, index) => [
    providerDistrictCode,
    summary(region, district, providerDistrictCode, "38", String(20_000 + index)),
  ]));
  const listCalls: string[] = [];
  const detailCalls: string[] = [];
  const provider: KtoCatalogProvider = {
    async listDistrict(input) {
      listCalls.push(input.districtCode);
      const records = [core.get(input.districtCode), shopping.get(input.districtCode)]
        .filter((value): value is TourPlaceSummary => value !== undefined)
        .map((value) => ({
          summary: value,
          authoritativeLegalRegionCode: value.legalRegionCode,
          authoritativeLegalDistrictCode: value.legalDistrictCode,
        }));
      return { records, page: input.page, pageSize: input.pageSize, totalCount: records.length };
    },
    async getPlaceDetail(contentId) {
      detailCalls.push(contentId);
      const value = [...core.values()].find((item) => item.contentId === contentId);
      if (!value) throw new Error("Shopping detail traversal is forbidden.");
      return detail(value);
    },
    getRequestAudit(): KtoProviderRequestAudit {
      return {
        liveProviderCallCount: listCalls.length + detailCalls.length * 3,
        operationCallCounts: {
          areaBasedList2: listCalls.length,
          detailCommon2: detailCalls.length,
          detailIntro2: detailCalls.length,
          detailPetTour2: detailCalls.length,
        },
      };
    },
  };
  return { provider, listCalls, detailCalls };
}

describe("Incheon and Gyeonggi regional expansion", () => {
  it("uses the current authoritative legal-dong mappings without omitting a returned district", () => {
    expect(INCHEON_REGION_CONFIG.districts.map(({ legalDongDistrictCode, name }) => [legalDongDistrictCode, name]))
      .toEqual(INCHEON_DISTRICTS);
    expect(GYEONGGI_REGION_CONFIG.districts.map(({ legalDongDistrictCode, name }) => [legalDongDistrictCode, name]))
      .toEqual(GYEONGGI_DISTRICTS);
    expect(getRegionConfigByService2LegalDongCode("28")?.id).toBe("incheon");
    expect(getRegionConfigByService2LegalDongCode("41")?.id).toBe("gyeonggi");
  });

  it.each([
    [INCHEON_REGION_CONFIG, "2"],
    [GYEONGGI_REGION_CONFIG, "31"],
  ] as const)("keeps %s map-only, KTO-only, and progressively loads Shopping", (region, legacyAreaCode) => {
    expect(region).toMatchObject({
      providerCodes: { legacyTourismAreaCode: legacyAreaCode },
      mapEnabled: true,
      ktoCatalogEnabled: true,
      itineraryEnabled: false,
      kakaoDiscoveryEnabled: false,
      allowedMapProviders: ["tour"],
      mapCatalog: {
        snapshotDatasets: ["core", "shopping"],
        deferredCategories: ["shopping"],
      },
    });
    expect(getKtoCollectionEnabledRegionConfig(region.id)?.id).toBe(region.id);
  });

  it("exposes 17 isolated selector regions and parses the new district URLs", () => {
    expect(getMapEnabledRegionConfigs().map(({ id }) => id)).toEqual([
      "seoul", "incheon", "daejeon", "daegu", "gwangju", "busan",
      "ulsan", "sejong", "gyeonggi", "gangwon", "chungbuk", "chungnam",
      "gyeongbuk", "gyeongnam", "jeonbuk", "jeonnam", "jeju",
    ]);
    expect(parsePublicCatalogUrlState({ region: "incheon", district: "720" }))
      .toMatchObject({ region: "incheon", district: "720" });
    expect(parsePublicCatalogUrlState({ region: "gyeonggi", district: "830" }))
      .toMatchObject({ region: "gyeonggi", district: "830" });
    expect(resolvePublicCatalogDistrictQuery("incheon", "옹진군")).toBe("720");
    expect(resolvePublicCatalogDistrictQuery("gyeonggi", "양평군")).toBe("830");
    expect(resolvePublicCatalogDistrictQuery("gyeonggi", "경기 전체")).toBe("all");
    expect(resolvePublicCatalogDistrictQuery("gyeonggi", "없는 지역")).toBeNull();
    expect(serializeResultsUrl("catalog", {
      region: "gyeonggi",
      district: "830",
      categories: ["attraction", "food", "cafe", "accommodation"],
      layers: ["tourism", "kakao", "veterinary", "pet_shop"],
      page: 1,
      sort: "recommendation",
    })).toContain("region=gyeonggi&district=830");
  });

  it("keeps CLI, registry, and cache identities region-driven", () => {
    expect(parseKtoCatalogCliArgs(["--region=incheon", "--apply", "--scope=full"]))
      .toMatchObject({ regionId: "incheon", mode: "apply", scope: "full" });
    expect(parseKtoCatalogCliArgs(["--region=gyeonggi", "--apply", "--resume=99"]))
      .toMatchObject({ regionId: "gyeonggi", resumeRunId: "99" });
    const namespaces = [INCHEON_REGION_CONFIG, GYEONGGI_REGION_CONFIG]
      .map((region) => region.ktoCollection.cacheNamespace);
    expect(new Set(namespaces).size).toBe(2);
    expect(namespaces.every((value, index) => value.includes(["incheon", "gyeonggi"][index])))
      .toBe(true);
  });

  it.each([INCHEON_REGION_CONFIG, GYEONGGI_REGION_CONFIG])(
    "traverses every $displayName district while keeping Shopping detail calls at zero",
    async (region) => {
      const { provider, listCalls, detailCalls } = providerFor(region);
      const result = await collectKtoCatalog({ region, provider });
      const providerDistrictCodes = region.districts.flatMap(
        ({ legalDongDistrictCode, collectionLegalDongDistrictCodes }) =>
          collectionLegalDongDistrictCodes ?? [legalDongDistrictCode],
      );
      expect(listCalls).toEqual(providerDistrictCodes);
      expect(detailCalls).toHaveLength(providerDistrictCodes.length);
      expect(result.audit.totals.datasetCounts).toEqual({
        core: providerDistrictCodes.length,
        shopping: providerDistrictCodes.length,
      });
      expect(result.rows.filter((row) => row.catalog_dataset === "shopping"))
        .toHaveLength(providerDistrictCodes.length);
      expect(result.rows.filter((row) => row.catalog_dataset === "shopping").every((row) => {
        const assessment = row.pet_evidence.assessment;
        return row.evidence_collection_mode === "list_only" &&
          row.pet_evidence_status === "official_unknown" &&
          row.pet_evidence.verificationStatus === "verification_required" &&
          typeof assessment === "object" &&
          assessment !== null &&
          !Array.isArray(assessment) &&
          "verdict" in assessment &&
          assessment.verdict === "unknown";
      }))
        .toBe(true);
    },
  );

  it("seeds both regions through one additive migration without altering policy or grants", () => {
    const sql = readFileSync(
      "supabase/migrations/20260827074042_add_incheon_gyeonggi_kto_catalog.sql",
      "utf8",
    );
    expect(sql).toContain("('incheon', '인천', '28'");
    expect(sql).toContain("('gyeonggi', '경기', '41'");
    expect(sql.match(/\('incheon', '[0-9]{3}',/gu)).toHaveLength(11);
    expect(sql.match(/\('gyeonggi', '[0-9]{3}',/gu)).toHaveLength(31);
    expect(sql).toContain("map_places_region_dataset_provider_active_id_idx");
    expect(sql).not.toMatch(/create\s+policy|drop\s+policy|grant\s|revoke\s/iu);
  });
});
