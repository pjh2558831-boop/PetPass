import type { Page } from "@playwright/test";
import {
  attachTourPetAccessEvaluationTime,
  createTrustedTourPetAccessInput,
  evaluateTourPetAccess,
} from "@/lib/pet-access/tourism/evaluator";
import { createTourismSourceRecord } from "@/lib/places/source-records";
import { computePlaceTrust } from "@/lib/trust/calculator";
import type {
  FoodLicenseMatchResult,
  LocalDataDataset,
  LocalDataLicenseRecord,
} from "@/types/license";
import type { TourPlaceDetail, TourPlaceDetailResponse } from "@/types/place";

const retrievedAt = "2026-08-05T00:00:00.000Z";

function record(
  dataset: LocalDataDataset,
  businessName = "마린 테라스 식탁",
): LocalDataLicenseRecord {
  const businessCategory =
    dataset === "general_restaurants" ? "일반음식점" : "휴게음식점";
  return {
    dataset,
    businessName,
    roadAddress: "부산광역시 해운대구 달맞이길 10",
    parcelAddress: null,
    postalCode: "48000",
    licensingDate: "20200101",
    businessStatusCode: "01",
    businessStatusName: "영업",
    detailedStatusCode: "01",
    detailedStatusName: "정상",
    closureDate: null,
    suspensionStartDate: null,
    suspensionEndDate: null,
    reopeningDate: null,
    phoneNumber: null,
    localGovernmentCode: "26",
    businessCategory,
    businessSubtype: null,
    roomCount: null,
    facilityArea: null,
    providerUpdatedAt: "20260805000000",
    operatingState: "active",
    source: {
      provider: "Ministry of the Interior and Safety",
      dataset,
      operation: "info",
      retrievedAt,
      providerUpdatedAt: "20260805000000",
    },
    sourceEvidence: {
      managementNumber: `${dataset}-e2e`,
      businessName,
      roadAddress: "부산광역시 해운대구 달맞이길 10",
      parcelAddress: null,
      roadPostalCode: "48000",
      parcelPostalCode: null,
      licensingDate: "20200101",
      businessStatusCode: "01",
      businessStatusName: "영업",
      detailedStatusCode: "01",
      detailedStatusName: "정상",
      closureDate: null,
      suspensionStartDate: null,
      suspensionEndDate: null,
      reopeningDate: null,
      phoneNumber: null,
      localGovernmentCode: "26",
      businessCategory,
      businessSubtype: null,
      roomCount: null,
      facilityArea: null,
      providerUpdatedAt: "20260805000000",
    },
  };
}

function licensingResult(
  state: FoodLicenseMatchResult["matchState"],
  dataset: LocalDataDataset = "general_restaurants",
): FoodLicenseMatchResult {
  const selectedRecord = state.startsWith("matched_") ? record(dataset) : null;
  const alternatives =
    state === "ambiguous"
      ? [
          {
            record: record("general_restaurants", "마린 테라스 식탁"),
            totalScore: 0.91,
            reasons: ["업소명과 주소가 일치합니다."],
            components: {
              name: 1,
              address: 0.8,
              exactName: true,
              tokenOverlap: 1,
              bigramSimilarity: 1,
              branchAgreement: "unknown" as const,
              accommodationTypeAgreement: "unknown" as const,
              genericAccommodationName: false,
              roadAgreement: true,
              buildingNumberAgreement: "agree" as const,
              districtAgreement: true,
              neighborhoodAgreement: false,
              parcelNumberAgreement: "unknown" as const,
              postalCodeAgreement: false,
            },
          },
          {
            record: record("rest_cafes", "마린 테라스 식탁 카페"),
            totalScore: 0.89,
            reasons: ["업소명과 주소가 유사합니다."],
            components: {
              name: 0.95,
              address: 0.8,
              exactName: false,
              tokenOverlap: 0.8,
              bigramSimilarity: 0.9,
              branchAgreement: "unknown" as const,
              accommodationTypeAgreement: "unknown" as const,
              genericAccommodationName: false,
              roadAgreement: true,
              buildingNumberAgreement: "agree" as const,
              districtAgreement: true,
              neighborhoodAgreement: false,
              parcelNumberAgreement: "unknown" as const,
              postalCodeAgreement: false,
            },
          },
        ]
      : [];
  return {
    licensingKind: "food",
    matchState: state,
    refinedVenueKind:
      selectedRecord?.dataset === "general_restaurants"
        ? "restaurant"
        : selectedRecord?.dataset === "rest_cafes"
          ? "cafe"
          : null,
    confidence: state === "matched_high" ? "high" : state === "matched_possible" || state === "ambiguous" ? "possible" : "none",
    totalScore: state.startsWith("matched_") || state === "ambiguous" ? 0.91 : null,
    reasons:
      state === "not_found"
        ? ["충분히 유사한 후보가 없습니다."]
        : state === "unavailable"
          ? ["제공처를 확인하지 못했습니다."]
          : ["업소명과 주소 근거를 비교했습니다."],
    selectedRecord,
    alternatives,
    operatingState: selectedRecord?.operatingState ?? null,
    sources:
      state === "unavailable" || state === "not_applicable"
        ? []
        : [record(dataset).source],
    section: {
      status: state === "unavailable" ? "unavailable" : "available",
      ...(state === "unavailable"
        ? { message: "현재 인허가 정보를 확인할 수 없습니다." }
        : {}),
    },
  };
}

export function liveDetail(
  state: FoodLicenseMatchResult["matchState"],
  dataset: LocalDataDataset = "general_restaurants",
): TourPlaceDetailResponse {
  const food = state !== "not_applicable";
  const licensing = licensingResult(state, dataset);
  const detail: TourPlaceDetail = {
    summary: {
      contentId: food ? "1005" : "1001",
      contentTypeId: food ? "39" : "12",
      providerContentTypeId: food ? "39" : "12",
      category: food ? "food" : "attraction",
      title: food ? "마린 테라스 식탁" : "해운대 해수욕장",
      address: "부산광역시 해운대구 달맞이길 10",
      detailAddress: null,
      longitude: 129.16,
      latitude: 35.16,
      phone: null,
      thumbnailUrl: null,
      imageUrl: null,
      copyrightType: null,
      createdTime: null,
      modifiedTime: "20260805000000",
      legalRegionCode: "26",
      legalDistrictCode: "16",
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
        operation: "detailCommon2",
        retrievedAt,
        contentId: food ? "1005" : "1001",
      },
    },
    overview: "한국관광공사 상세 소개입니다.",
    homepageUrl: null,
    operatingInformation: null,
    restDayInformation: null,
    parkingInformation: null,
    reservationInformation: null,
    contactInformation: null,
    providerModifiedTime: "20260805000000",
    petPolicyEvidence: {
      fields: {
        acmpyTypeCd: "전구역 동반가능",
        acmpyPsblCpam: null,
        acmpyNeedMtr: null,
        etcAcmpyInfo: null,
        relaAcdntRiskMtr: null,
        relaPosesFclty: null,
        relaFrnshPrdlst: null,
        relaPurcPrdlst: null,
        relaRntlPrdlst: null,
      },
      sourceEvidence: {
        provider: "Korea Tourism Organization",
        operation: "detailPetTour2",
        contentId: food ? "1005" : "1001",
        retrievedAt,
        originalEvidenceFields: {
          acmpyTypeCd: "전구역 동반가능",
          acmpyPsblCpam: null,
          acmpyNeedMtr: null,
          etcAcmpyInfo: null,
          relaAcdntRiskMtr: null,
          relaPosesFclty: null,
          relaFrnshPrdlst: null,
          relaPurcPrdlst: null,
          relaRntlPrdlst: null,
        },
      },
    },
    introPetPolicyEvidence: null,
    licensing,
    sections: {
      common: { status: "available" },
      intro: { status: "available" },
      petPolicy: { status: "available" },
      licensing: licensing.section,
    },
    source: {
      provider: "Korea Tourism Organization",
      operation: "detailCommon2",
      retrievedAt,
      contentId: food ? "1005" : "1001",
    },
  };
  const petAccessAssessment = attachTourPetAccessEvaluationTime(
      evaluateTourPetAccess(createTrustedTourPetAccessInput(detail)),
      retrievedAt,
    );
  return {
    ...detail,
    petAccessAssessment,
    sourceRecords: [
      createTourismSourceRecord(
        detail.summary,
        `반려동물 원문 근거 ${petAccessAssessment.evidence.length}건`,
      ),
    ],
    trust: computePlaceTrust({
      computedAt: retrievedAt,
      hasAnySource: true,
      tourism: {
        hasPetSpecificEvidence: true,
        retrievedAt,
      },
      licensingOperatingState: licensing.operatingState,
    }),
  };
}

export async function installDetailMock(
  page: Page,
  state: FoodLicenseMatchResult["matchState"],
  dataset: LocalDataDataset = "general_restaurants",
): Promise<void> {
  await page.route(/\/api\/tour\/places\/\d+/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: liveDetail(state, dataset),
        requestId: "e2e-license-mock",
      }),
    });
  });
}
