import type {
  KtoCatalogListRecord,
  KtoCatalogProvider,
} from "@/lib/tour-api/collection/contracts";
import type {
  TourContentTypeId,
  TourPlaceDetail,
  TourPlaceSummary,
} from "@/types/place";

const RETRIEVED_AT = "2026-08-19T04:00:00.000Z";

function summary(input: {
  contentId: string;
  contentTypeId: TourContentTypeId;
  title: string;
  districtCode: string;
  regionCode?: string;
  latitude: number;
  longitude: number;
  imageUrl?: string | null;
}): TourPlaceSummary {
  const categories = {
    "12": "attraction",
    "14": "culture",
    "15": "festival",
    "28": "leisure",
    "32": "accommodation",
    "38": "shopping",
    "39": "food",
  } as const;
  return {
    contentId: input.contentId,
    contentTypeId: input.contentTypeId,
    providerContentTypeId: input.contentTypeId,
    category: categories[input.contentTypeId],
    title: input.title,
    address:
      input.districtCode === "130"
        ? "제주특별자치도 서귀포시 테스트로 2"
        : input.regionCode === "26"
          ? "부산광역시 중구 테스트로 3"
          : "제주특별자치도 제주시 테스트로 1",
    detailAddress: null,
    longitude: input.longitude,
    latitude: input.latitude,
    phone: "064-000-0000",
    thumbnailUrl: null,
    imageUrl: input.imageUrl ?? null,
    copyrightType: "Type1",
    createdTime: "20260101000000",
    modifiedTime: "20260818000000",
    legalRegionCode: input.regionCode ?? "50",
    legalDistrictCode: input.districtCode,
    classificationCodes: {
      primary: "A01",
      secondary: "A0101",
      tertiary: "A01010100",
      largeCategory: "AC",
      middleCategory: "AC01",
      smallCategory: "AC0101",
    },
    source: {
      provider: "Korea Tourism Organization",
      operation: "areaBasedList2",
      retrievedAt: RETRIEVED_AT,
      contentId: input.contentId,
      providerModifiedTime: "20260818000000",
    },
  };
}

function record(
  value: TourPlaceSummary,
  authoritativeLegalRegionCode = value.legalRegionCode,
  authoritativeLegalDistrictCode = value.legalDistrictCode,
): KtoCatalogListRecord {
  return {
    summary: value,
    authoritativeLegalRegionCode,
    authoritativeLegalDistrictCode,
  };
}

function detail(value: TourPlaceSummary, policy: "allowed" | "absent"): TourPlaceDetail {
  const petPolicyEvidence =
    policy === "allowed"
      ? {
          fields: {
            acmpyTypeCd: "전구역 동반가능",
            acmpyPsblCpam: null,
            acmpyNeedMtr: "목줄 착용",
            etcAcmpyInfo: null,
            relaAcdntRiskMtr: null,
            relaPosesFclty: null,
            relaFrnshPrdlst: null,
            relaPurcPrdlst: null,
            relaRntlPrdlst: null,
          },
          sourceEvidence: {
            provider: "Korea Tourism Organization" as const,
            operation: "detailPetTour2" as const,
            contentId: value.contentId,
            retrievedAt: RETRIEVED_AT,
            providerModifiedTime: "20260818000000",
            originalEvidenceFields: {
              acmpyTypeCd: "전구역 동반가능",
              acmpyPsblCpam: null,
              acmpyNeedMtr: "목줄 착용",
              etcAcmpyInfo: null,
              relaAcdntRiskMtr: null,
              relaPosesFclty: null,
              relaFrnshPrdlst: null,
              relaPurcPrdlst: null,
              relaRntlPrdlst: null,
            },
          },
        }
      : null;
  return {
    summary: {
      ...value,
      source: { ...value.source, operation: "detailCommon2" },
    },
    overview: "위생 수칙을 지켜 이용해 주세요.",
    homepageUrl: `https://example.com/tour/${value.contentId}`,
    operatingInformation: null,
    checkInTime: null,
    checkOutTime: null,
    restDayInformation: null,
    parkingInformation: null,
    reservationInformation: null,
    contactInformation: null,
    providerModifiedTime: "20260818000000",
    petPolicyEvidence,
    normalizedPetEvidence: {
      availability: policy === "allowed" ? "partial" : "absent",
      fields:
        petPolicyEvidence?.fields ?? {
          acmpyTypeCd: null,
          acmpyPsblCpam: null,
          acmpyNeedMtr: null,
          etcAcmpyInfo: null,
          relaAcdntRiskMtr: null,
          relaPosesFclty: null,
          relaFrnshPrdlst: null,
          relaPurcPrdlst: null,
          relaRntlPrdlst: null,
        },
      sourceFields: [],
      emptyFieldNames: [],
      absentFieldNames: [],
      warningCodes: [],
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
      retrievedAt: RETRIEVED_AT,
      providerModifiedTime: "20260818000000",
    },
  };
}

const JEJU_CITY_IMAGE = summary({
  contentId: "5001001",
  contentTypeId: "12",
  title: "제주 이미지 관광지",
  districtCode: "110",
  latitude: 33.5,
  longitude: 126.53,
  imageUrl: "https://tong.visitkorea.or.kr/fixture-jeju.jpg",
});
const JEJU_CITY_NO_IMAGE = summary({
  contentId: "5001002",
  contentTypeId: "39",
  title: "제주 이미지 없는 음식점",
  districtCode: "110",
  latitude: 33.51,
  longitude: 126.54,
});
const JEJU_SHOPPING = summary({
  contentId: "5001003",
  contentTypeId: "38",
  title: "제외할 쇼핑",
  districtCode: "110",
  latitude: 33.52,
  longitude: 126.55,
});
const OUT_OF_REGION = summary({
  contentId: "5001004",
  contentTypeId: "14",
  title: "좌표 오류",
  districtCode: "110",
  latitude: 35.18,
  longitude: 129.08,
});
const BUSAN_JUNG_GU = summary({
  contentId: "2601001",
  contentTypeId: "12",
  title: "부산 중구 혼입",
  districtCode: "110",
  regionCode: "26",
  latitude: 35.1063,
  longitude: 129.0324,
});
const SEOGWIPO = summary({
  contentId: "5002001",
  contentTypeId: "32",
  title: "서귀포 숙소",
  districtCode: "130",
  latitude: 33.2541,
  longitude: 126.5601,
});

export const JEJU_KTO_COLLECTION_FIXTURE = {
  "110": [
    record(JEJU_CITY_IMAGE),
    record(JEJU_CITY_NO_IMAGE),
    record(JEJU_SHOPPING),
    record(OUT_OF_REGION),
    record(BUSAN_JUNG_GU, "26", "110"),
    record(JEJU_CITY_IMAGE),
  ],
  "130": [record(SEOGWIPO)],
} as const;

const DETAILS = new Map([
  [JEJU_CITY_IMAGE.contentId, detail(JEJU_CITY_IMAGE, "allowed")],
  [JEJU_CITY_NO_IMAGE.contentId, detail(JEJU_CITY_NO_IMAGE, "absent")],
  [SEOGWIPO.contentId, detail(SEOGWIPO, "allowed")],
]);

export function createJejuKtoFixtureProvider(options: {
  failContentId?: string;
} = {}): KtoCatalogProvider & {
  listCalls: Array<{ regionCode: string; districtCode: string }>;
  detailCalls: string[];
} {
  const listCalls: Array<{ regionCode: string; districtCode: string }> = [];
  const detailCalls: string[] = [];
  return {
    listCalls,
    detailCalls,
    async listDistrict(input) {
      listCalls.push({
        regionCode: input.regionCode,
        districtCode: input.districtCode,
      });
      const records = JEJU_KTO_COLLECTION_FIXTURE[
        input.districtCode as keyof typeof JEJU_KTO_COLLECTION_FIXTURE
      ] ?? [];
      return {
        records: [...records],
        page: 1,
        pageSize: input.pageSize,
        totalCount: records.length,
      };
    },
    async getPlaceDetail(contentId) {
      detailCalls.push(contentId);
      if (options.failContentId === contentId) throw new Error("fixture provider failure");
      const value = DETAILS.get(contentId);
      if (!value) throw new Error(`missing fixture detail ${contentId}`);
      return structuredClone(value);
    },
  };
}
