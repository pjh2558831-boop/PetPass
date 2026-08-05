import "server-only";

import {
  getDefaultLocalDataClient,
  type LocalDataSearchResult,
  type LocalDataSearchService,
} from "@/lib/licenses/client";
import { LicenseRequestCache } from "@/lib/licenses/cache";
import {
  clusterAccommodationCandidates,
  getPreciseRoadAddressCondition,
  getRelaxedBusinessNameSegment,
  isGenericAccommodationName,
  normalizeBusinessName,
  rankLicenseCandidates,
} from "@/lib/licenses/matcher";
import {
  ACCOMMODATION_LOCALDATA_DATASETS,
  FOOD_LOCALDATA_DATASETS,
  type AccommodationDatasetMatchResult,
  type AccommodationLicenseMatchResult,
  type AccommodationLocalDataDataset,
  type FoodLicenseMatchResult,
  type LicenseMatchCandidate,
  type LicensingMatchResult,
  type LocalDataDataset,
} from "@/types/license";
import type { TourPlaceDetail } from "@/types/place";

const MATCH_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const HIGH_THRESHOLD = 0.86;
const POSSIBLE_THRESHOLD = 0.72;
const CLEAR_GAP = 0.08;

export interface FoodLicenseMatcher {
  matchTourPlace(detail: TourPlaceDetail): Promise<FoodLicenseMatchResult>;
}

export interface LicenseMatcher {
  matchTourPlace(detail: TourPlaceDetail): Promise<LicensingMatchResult>;
}

function section(
  status: "available" | "partial" | "unavailable",
  message?: string,
) {
  return { status, ...(message ? { message } : {}) };
}

function foodNotApplicable(): FoodLicenseMatchResult {
  return {
    licensingKind: "food",
    matchState: "not_applicable",
    refinedVenueKind: null,
    confidence: "none",
    totalScore: null,
    reasons: ["지원되는 음식점 콘텐츠 유형이 아닙니다."],
    selectedRecord: null,
    alternatives: [],
    operatingState: null,
    sources: [],
    section: section("available"),
  };
}

function accommodationNotApplicable(): AccommodationLicenseMatchResult {
  return {
    licensingKind: "accommodation",
    matchState: "not_applicable",
    refinedVenueKind: null,
    confidence: "none",
    totalScore: null,
    reasons: ["지원되는 숙박 콘텐츠 유형이 아닙니다."],
    matchedBusiness: null,
    selectedRecords: [],
    perDatasetResults: [],
    alternatives: [],
    operatingState: null,
    operatingStateDiscrepancy: false,
    sources: [],
    section: section("available"),
  };
}

function foodUnavailable(
  reason: string,
  sources: FoodLicenseMatchResult["sources"] = [],
  sectionStatus: "partial" | "unavailable" = "unavailable",
): FoodLicenseMatchResult {
  return {
    licensingKind: "food",
    matchState: "unavailable",
    refinedVenueKind: null,
    confidence: "none",
    totalScore: null,
    reasons: [reason],
    selectedRecord: null,
    alternatives: [],
    operatingState: null,
    sources,
    section: section(
      sectionStatus,
      "현재 인허가 정보를 확인할 수 없습니다.",
    ),
  };
}

function accommodationUnavailable(
  reason: string,
  perDatasetResults: AccommodationDatasetMatchResult[] = [],
  sources: AccommodationLicenseMatchResult["sources"] = [],
  sectionStatus: "partial" | "unavailable" = "unavailable",
): AccommodationLicenseMatchResult {
  return {
    licensingKind: "accommodation",
    matchState: "unavailable",
    refinedVenueKind: null,
    confidence: "none",
    totalScore: null,
    reasons: [reason],
    matchedBusiness: null,
    selectedRecords: [],
    perDatasetResults,
    alternatives: [],
    operatingState: null,
    operatingStateDiscrepancy: false,
    sources,
    section: section(
      sectionStatus,
      "현재 숙박 인허가 정보를 확인할 수 없습니다.",
    ),
  };
}

function foodVenueKind(
  candidate: LicenseMatchCandidate | undefined,
): "restaurant" | "cafe" | null {
  if (candidate?.record.dataset === "general_restaurants") return "restaurant";
  if (candidate?.record.dataset === "rest_cafes") return "cafe";
  return null;
}

function hasHighPrerequisites(candidate: LicenseMatchCandidate): boolean {
  return (
    candidate.components.name >= 0.82 &&
    candidate.components.address >= 0.65 &&
    candidate.components.buildingNumberAgreement !== "conflict" &&
    candidate.components.parcelNumberAgreement !== "conflict" &&
    candidate.components.branchAgreement !== "conflict" &&
    candidate.components.accommodationTypeAgreement !== "conflict"
  );
}

function accommodationVenueKind(
  candidates: LicenseMatchCandidate[],
): AccommodationLicenseMatchResult["refinedVenueKind"] {
  if (!candidates.some(hasHighPrerequisites)) return null;
  if (candidates.some(({ record }) => record.dataset === "tourist_pensions")) {
    return "pension";
  }
  const providerTypes = candidates
    .flatMap(({ record }) => [record.businessCategory, record.businessSubtype])
    .filter(Boolean)
    .join(" ");
  if (/리조트|콘도|resort|condo/iu.test(providerTypes)) return "resort";
  if (/호텔|hotel/iu.test(providerTypes)) return "hotel";
  return "accommodation";
}

function datasetResult(
  result: LocalDataSearchResult,
  candidates: LicenseMatchCandidate[],
): AccommodationDatasetMatchResult {
  const top = candidates[0];
  const second = candidates[1];
  const plausible = candidates.filter(
    (candidate) => candidate.totalScore >= POSSIBLE_THRESHOLD,
  );
  if (!top || top.totalScore < POSSIBLE_THRESHOLD) {
    return {
      dataset: result.dataset as AccommodationLocalDataDataset,
      candidateCount: result.records.length,
      matchState: "not_found",
      confidence: "none",
      totalScore: top?.totalScore ?? null,
      selectedRecords: [],
      alternatives: [],
      source: result.source,
    };
  }
  const gap = second ? top.totalScore - second.totalScore : 1;
  if (plausible.length >= 2 && gap < CLEAR_GAP) {
    return {
      dataset: result.dataset as AccommodationLocalDataDataset,
      candidateCount: result.records.length,
      matchState: "ambiguous",
      confidence: "possible",
      totalScore: top.totalScore,
      selectedRecords: [],
      alternatives: plausible.slice(0, 3),
      source: result.source,
    };
  }
  const high =
    top.totalScore >= HIGH_THRESHOLD &&
    gap >= CLEAR_GAP &&
    hasHighPrerequisites(top);
  return {
    dataset: result.dataset as AccommodationLocalDataDataset,
    candidateCount: result.records.length,
    matchState: high ? "matched_high" : "matched_possible",
    confidence: high ? "high" : "possible",
    totalScore: top.totalScore,
    selectedRecords: [top.record],
    alternatives: [],
    source: result.source,
  };
}

export class LicenseMatchingService implements LicenseMatcher {
  constructor(
    private readonly providedSearchService?: LocalDataSearchService,
    private readonly cache = new LicenseRequestCache(),
  ) {}

  private get searchService(): LocalDataSearchService {
    return this.providedSearchService ?? getDefaultLocalDataClient();
  }

  private async searchDataset(
    dataset: LocalDataDataset,
    businessName: string,
    address: string,
    domain: "food" | "accommodation",
  ): Promise<LocalDataSearchResult> {
    const normalizedName = normalizeBusinessName(businessName);
    const useAddressCondition =
      normalizedName.canonical.length <= 6 ||
      (domain === "accommodation" && isGenericAccommodationName(businessName));
    const preciseAddress = useAddressCondition
      ? getPreciseRoadAddressCondition(address)
      : null;
    const initial = await this.searchService.search({
      dataset,
      businessName: businessName.slice(0, 80),
      ...(preciseAddress ? { roadAddressCondition: preciseAddress } : {}),
    });
    if (initial.records.length > 0) return initial;

    const relaxed = getRelaxedBusinessNameSegment(businessName, domain);
    if (!relaxed) return initial;
    return this.searchService.search({
      dataset,
      businessName: relaxed,
      ...(preciseAddress ? { roadAddressCondition: preciseAddress } : {}),
    });
  }

  matchFoodPlace(detail: TourPlaceDetail): Promise<FoodLicenseMatchResult> {
    const supported =
      detail.summary.providerContentTypeId === "82" &&
      detail.summary.category === "food";
    if (!supported) return Promise.resolve(foodNotApplicable());

    const businessName = detail.summary.title?.trim();
    const address = [detail.summary.address, detail.summary.detailAddress]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!businessName || !address) {
      return Promise.resolve(
        foodUnavailable(
          "신뢰할 수 있는 관광지 업소명 또는 주소가 부족합니다.",
        ),
      );
    }

    const cacheKey = [
      "food",
      detail.summary.contentId,
      detail.summary.providerContentTypeId,
      detail.summary.modifiedTime ?? detail.providerModifiedTime ?? "",
      businessName,
      address,
    ].join(":");
    return this.cache.getOrLoad(cacheKey, MATCH_CACHE_TTL_MS, async () => {
      const settled = await Promise.allSettled(
        FOOD_LOCALDATA_DATASETS.map((dataset) =>
          this.searchDataset(dataset, businessName, address, "food"),
        ),
      );
      const successful = settled
        .filter(
          (
            result,
          ): result is PromiseFulfilledResult<LocalDataSearchResult> =>
            result.status === "fulfilled",
        )
        .map((result) => result.value);
      const providerFailureCount = settled.length - successful.length;
      if (successful.length === 0) {
        return foodUnavailable(
          "두 LocalData 제공처를 모두 확인하지 못했습니다.",
        );
      }

      const candidates = rankLicenseCandidates(
        { businessName, address, domain: "food" },
        successful.flatMap((result) => result.records),
      );
      const top = candidates[0];
      const second = candidates[1];
      const gap = top && second ? top.totalScore - second.totalScore : 1;
      const plausible = candidates.filter(
        (candidate) => candidate.totalScore >= POSSIBLE_THRESHOLD,
      );
      const sources = successful.map((result) => result.source);
      const partial = providerFailureCount > 0;

      if (!top || top.totalScore < POSSIBLE_THRESHOLD) {
        if (partial) {
          return foodUnavailable(
            "일부 LocalData 제공처를 확인하지 못했습니다.",
            sources,
            "partial",
          );
        }
        return {
          licensingKind: "food",
          matchState: "not_found",
          refinedVenueKind: null,
          confidence: "none",
          totalScore: top?.totalScore ?? null,
          reasons: top?.reasons ?? ["검색된 인허가 후보가 없습니다."],
          selectedRecord: null,
          alternatives: [],
          operatingState: null,
          sources,
          section: section("available"),
        };
      }

      if (plausible.length >= 2 && gap < CLEAR_GAP) {
        return {
          licensingKind: "food",
          matchState: "ambiguous",
          refinedVenueKind: null,
          confidence: "possible",
          totalScore: top.totalScore,
          reasons: [
            "점수가 비슷한 후보가 여러 개라 하나를 확정하지 않았습니다.",
          ],
          selectedRecord: null,
          alternatives: plausible.slice(0, 3),
          operatingState: null,
          sources,
          section: section(
            partial ? "partial" : "available",
            partial
              ? "일부 인허가 제공처를 확인하지 못했습니다."
              : undefined,
          ),
        };
      }

      const high =
        !partial &&
        top.totalScore >= HIGH_THRESHOLD &&
        gap >= CLEAR_GAP &&
        hasHighPrerequisites(top);
      return {
        licensingKind: "food",
        matchState: high ? "matched_high" : "matched_possible",
        refinedVenueKind: foodVenueKind(top),
        confidence: high ? "high" : "possible",
        totalScore: top.totalScore,
        reasons: [
          ...top.reasons,
          ...(partial
            ? ["한 LocalData 제공처를 확인하지 못해 확정도를 낮췄습니다."]
            : []),
        ],
        selectedRecord: top.record,
        alternatives: [],
        operatingState: top.record.operatingState,
        sources,
        section: section(
          partial ? "partial" : "available",
          partial ? "일부 인허가 제공처를 확인하지 못했습니다." : undefined,
        ),
      };
    });
  }

  matchAccommodationPlace(
    detail: TourPlaceDetail,
  ): Promise<AccommodationLicenseMatchResult> {
    const supported =
      detail.summary.providerContentTypeId === "80" &&
      detail.summary.category === "accommodation";
    if (!supported) return Promise.resolve(accommodationNotApplicable());

    const businessName = detail.summary.title?.trim();
    const address = [detail.summary.address, detail.summary.detailAddress]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!businessName || !address) {
      return Promise.resolve(
        accommodationUnavailable(
          "신뢰할 수 있는 관광지 숙소명 또는 주소가 부족합니다.",
        ),
      );
    }

    const cacheKey = [
      "accommodation",
      detail.summary.contentId,
      detail.summary.providerContentTypeId,
      detail.summary.modifiedTime ?? detail.providerModifiedTime ?? "",
      businessName,
      address,
    ].join(":");
    return this.cache.getOrLoad(cacheKey, MATCH_CACHE_TTL_MS, async () => {
      const settled = await Promise.allSettled(
        ACCOMMODATION_LOCALDATA_DATASETS.map((dataset) =>
          this.searchDataset(dataset, businessName, address, "accommodation"),
        ),
      );
      const successful: LocalDataSearchResult[] = [];
      const perDatasetResults: AccommodationDatasetMatchResult[] = [];
      settled.forEach((result, index) => {
        const dataset = ACCOMMODATION_LOCALDATA_DATASETS[index];
        if (result.status === "fulfilled") successful.push(result.value);
        else {
          perDatasetResults.push({
            dataset,
            candidateCount: 0,
            matchState: "unavailable",
            confidence: "none",
            totalScore: null,
            selectedRecords: [],
            alternatives: [],
            source: null,
          });
        }
      });
      if (successful.length === 0) {
        return accommodationUnavailable(
          "세 LocalData 제공처를 모두 확인하지 못했습니다.",
          perDatasetResults,
        );
      }

      const target = { businessName, address, domain: "accommodation" as const };
      const rankedByDataset = successful.map((result) => ({
        result,
        candidates: rankLicenseCandidates(target, result.records),
      }));
      perDatasetResults.push(
        ...rankedByDataset.map(({ result, candidates }) =>
          datasetResult(result, candidates),
        ),
      );
      perDatasetResults.sort(
        (left, right) =>
          ACCOMMODATION_LOCALDATA_DATASETS.indexOf(left.dataset) -
          ACCOMMODATION_LOCALDATA_DATASETS.indexOf(right.dataset),
      );

      const allCandidates = rankedByDataset.flatMap(({ candidates }) => candidates);
      const plausibleCandidates = allCandidates
        .filter((candidate) => candidate.totalScore >= POSSIBLE_THRESHOLD);
      const clusters = clusterAccommodationCandidates(plausibleCandidates);
      const top = clusters[0];
      const second = clusters[1];
      const gap = top && second ? top.aggregateScore - second.aggregateScore : 1;
      const providerFailureCount = settled.length - successful.length;
      const partial = providerFailureCount > 0;
      const sources = successful.map((result) => result.source);
      const materiallyConflicting = allCandidates.filter(
        (candidate) =>
          candidate.components.name >= 0.82 &&
          (candidate.components.buildingNumberAgreement === "conflict" ||
            candidate.components.parcelNumberAgreement === "conflict"),
      );

      if (materiallyConflicting.length > 0) {
        const alternatives = clusterAccommodationCandidates([
          ...plausibleCandidates,
          ...materiallyConflicting.filter(
            (candidate) => !plausibleCandidates.includes(candidate),
          ),
        ]).slice(0, 3);
        return {
          licensingKind: "accommodation",
          matchState: "ambiguous",
          refinedVenueKind: null,
          confidence: "possible",
          totalScore:
            alternatives[0]?.aggregateScore ??
            materiallyConflicting[0]?.totalScore ??
            null,
          reasons: [
            "업소명은 유사하지만 건물번호 또는 지번이 충돌해 수동 확인이 필요합니다.",
          ],
          matchedBusiness: null,
          selectedRecords: [],
          perDatasetResults,
          alternatives,
          operatingState: null,
          operatingStateDiscrepancy: false,
          sources,
          section: section(
            partial ? "partial" : "available",
            partial
              ? "일부 숙박 인허가 제공처를 확인하지 못했습니다."
              : undefined,
          ),
        };
      }

      if (!top) {
        if (partial) {
          return accommodationUnavailable(
            "일부 LocalData 제공처를 확인하지 못해 숙박 인허가 일치 여부를 완료할 수 없습니다.",
            perDatasetResults,
            sources,
            "partial",
          );
        }
        const bestCandidate = allCandidates.sort(
          (left, right) => right.totalScore - left.totalScore,
        )[0];
        return {
          licensingKind: "accommodation",
          matchState: "not_found",
          refinedVenueKind: null,
          confidence: "none",
          totalScore: bestCandidate?.totalScore ?? null,
          reasons: bestCandidate?.reasons ?? ["검색된 숙박 인허가 후보가 없습니다."],
          matchedBusiness: null,
          selectedRecords: [],
          perDatasetResults,
          alternatives: [],
          operatingState: null,
          operatingStateDiscrepancy: false,
          sources,
          section: section("available"),
        };
      }

      if (second && gap < CLEAR_GAP) {
        return {
          licensingKind: "accommodation",
          matchState: "ambiguous",
          refinedVenueKind: null,
          confidence: "possible",
          totalScore: top.aggregateScore,
          reasons: [
            "서로 다른 숙박시설 후보의 점수가 비슷해 수동 확인이 필요합니다.",
          ],
          matchedBusiness: null,
          selectedRecords: [],
          perDatasetResults,
          alternatives: clusters.slice(0, 3),
          operatingState: null,
          operatingStateDiscrepancy: false,
          sources,
          section: section(
            partial ? "partial" : "available",
            partial
              ? "일부 숙박 인허가 제공처를 확인하지 못했습니다."
              : undefined,
          ),
        };
      }

      const high =
        !partial &&
        top.aggregateScore >= HIGH_THRESHOLD &&
        gap >= CLEAR_GAP &&
        top.records.some(hasHighPrerequisites);
      const selectedRecords = top.records.map(({ record }) => record);
      const operatingStates = new Set(
        selectedRecords.map((record) => record.operatingState),
      );
      const operatingStateDiscrepancy = operatingStates.size > 1;
      return {
        licensingKind: "accommodation",
        matchState: high ? "matched_high" : "matched_possible",
        refinedVenueKind: accommodationVenueKind(top.records),
        confidence: high ? "high" : "possible",
        totalScore: top.aggregateScore,
        reasons: [
          ...top.reasons,
          ...(operatingStateDiscrepancy
            ? ["데이터별 영업상태가 달라 현재 상태 확인이 필요합니다."]
            : []),
          ...(partial
            ? ["한 개 이상의 숙박 인허가 제공처를 확인하지 못했습니다."]
            : []),
        ],
        matchedBusiness: top.identity,
        selectedRecords,
        perDatasetResults,
        alternatives: [],
        operatingState: operatingStateDiscrepancy
          ? "requires_confirmation"
          : selectedRecords[0]?.operatingState ?? null,
        operatingStateDiscrepancy,
        sources,
        section: section(
          partial ? "partial" : "available",
          partial
            ? "일부 숙박 인허가 제공처를 확인하지 못했습니다."
            : undefined,
        ),
      };
    });
  }

  matchTourPlace(detail: TourPlaceDetail): Promise<LicensingMatchResult> {
    if (
      detail.summary.providerContentTypeId === "82" &&
      detail.summary.category === "food"
    ) {
      return this.matchFoodPlace(detail);
    }
    if (
      detail.summary.providerContentTypeId === "80" &&
      detail.summary.category === "accommodation"
    ) {
      return this.matchAccommodationPlace(detail);
    }
    return Promise.resolve(foodNotApplicable());
  }
}

/** Backward-compatible façade for existing food-only consumers and tests. */
export class FoodLicenseMatchingService implements FoodLicenseMatcher {
  private readonly service: LicenseMatchingService;

  constructor(
    searchService?: LocalDataSearchService,
    cache = new LicenseRequestCache(),
  ) {
    this.service = new LicenseMatchingService(searchService, cache);
  }

  matchTourPlace(detail: TourPlaceDetail): Promise<FoodLicenseMatchResult> {
    return this.service.matchFoodPlace(detail);
  }
}

let defaultService: LicenseMatchingService | undefined;
let defaultFoodService: FoodLicenseMatchingService | undefined;

export function getDefaultLicenseMatchingService(): LicenseMatchingService {
  defaultService ??= new LicenseMatchingService();
  return defaultService;
}

export function getDefaultFoodLicenseMatchingService(): FoodLicenseMatchingService {
  defaultFoodService ??= new FoodLicenseMatchingService();
  return defaultFoodService;
}

export function createUnavailableLicenseResult(
  kind: "food" | "accommodation" = "food",
): LicensingMatchResult {
  return kind === "accommodation"
    ? accommodationUnavailable(
        "인허가 확인 과정에서 안전하게 처리하지 못한 응답이 있었습니다.",
      )
    : foodUnavailable(
        "인허가 확인 과정에서 안전하게 처리하지 못한 응답이 있었습니다.",
      );
}

export const LICENSE_MATCH_THRESHOLDS = {
  nameWeight: 0.55,
  addressWeight: 0.45,
  high: HIGH_THRESHOLD,
  possible: POSSIBLE_THRESHOLD,
  clearGap: CLEAR_GAP,
} as const;

export const MAX_LOCALDATA_CALLS_PER_DETAIL = {
  food: FOOD_LOCALDATA_DATASETS.length * 2,
  accommodation: ACCOMMODATION_LOCALDATA_DATASETS.length * 2,
} as const;
