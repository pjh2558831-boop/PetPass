import "server-only";

import { getDirections } from "@/lib/kakao/directions";
import {
  createTrustedTourPetAccessInput,
  evaluateTourPetAccess,
} from "@/lib/pet-access/tourism/evaluator";
import {
  assessPetSizeCompatibility,
  type PetSizeSourceEvidence,
} from "@/lib/pet-access/tourism/size-compatibility";
import { getItineraryGenerationRequestKey } from "@/lib/itinerary/request-schema";
import { assessOperatingHours } from "@/lib/itinerary/operating-hours";
import { haversineKm } from "@/lib/itinerary/optimizer";
import {
  TOUR_CATALOG_MAX_PAGES_PER_CONTENT_TYPE,
  collectTourCatalog,
} from "@/lib/tour-api/catalog-service";
import {
  getCatalogContentTypeId,
  TOUR_ITINERARY_ELIGIBLE_CONTENT_TYPE_IDS,
  type BusanDistrictCode,
  type TourCatalogCategory,
} from "@/lib/tour-api/catalog";
import {
  getDefaultTourService,
  type TourPlaceService,
} from "@/lib/tour-api/service";
import type { KakaoDirectionsRequest, KakaoDrivingRoute } from "@/types/kakao";
import type {
  TourContentTypeId,
  TourPlaceDetail,
  TourPlaceSummary,
} from "@/types/place";
import type {
  GeneratedItinerary,
  GeneratedItineraryStop,
  ItineraryCandidateFunnel,
  ItineraryExclusionCounts,
  ItineraryGenerationLimits,
  ItineraryGenerationResponse,
  ItineraryProfile,
  NormalizedItineraryRequest,
} from "@/types/route-generation";
import type { PetSizeCompatibilityResult } from "@/types/pet-size-compatibility";
import type { TourPetAccessSemanticAssessment } from "@/types/tour-pet-access";

export const ITINERARY_GENERATION_LIMITS = {
  maxCatalogCandidates: 80,
  maxDetailCalls: 12,
  maxDirectionsCalls: 6,
  detailConcurrency: 3,
  catalogConcurrency: 2,
  maxCatalogPagesPerContentType: TOUR_CATALOG_MAX_PAGES_PER_CONTENT_TYPE,
} as const satisfies ItineraryGenerationLimits;

export const MAX_ITINERARY_JACCARD_OVERLAP = 0.6;

const PROFILE_VARIANTS = 2;
const VISIT_DURATION_MINUTES = {
  attraction: 60,
  culture: 75,
  festival: 90,
  leisure: 90,
  accommodation: 60,
  food: 75,
  shopping: 60,
} as const satisfies Record<TourCatalogCategory, number>;

const PROFILE_COPY: Record<
  ItineraryProfile,
  { title: string; explanation: string }
> = {
  minimum_travel: {
    title: "이동 최소 코스",
    explanation:
      "출발지와 각 장소 사이의 직선거리를 기준으로 가까운 후보를 먼저 고른 뒤, 실제 Kakao 길찾기로 이동 거리와 시간을 확정했습니다.",
  },
  balanced_tour_food: {
    title: "관광·식사 균형 코스",
    explanation:
      "선택한 카테고리를 고르게 배치하고, 음식점을 선택했고 이용 가능한 경우 식사 장소를 포함한 뒤 실제 Kakao 길찾기로 확정했습니다.",
  },
  walk_leisure: {
    title: "산책·레저 중심 코스",
    explanation:
      "선택한 후보 중 레저와 관광지를 우선 조합하고, 실제 Kakao 길찾기로 이동 거리와 시간을 확정했습니다.",
  },
};

interface EligibleCandidate {
  summary: TourPlaceSummary & {
    title: string;
    contentTypeId: TourContentTypeId;
    providerContentTypeId: TourContentTypeId;
    category: TourCatalogCategory;
    latitude: number;
    longitude: number;
  };
  detail: TourPlaceDetail;
  assessment: TourPetAccessSemanticAssessment & {
    verdict: "allowed" | "conditional";
  };
  sizeCompatibility: PetSizeCompatibilityResult;
}

type PreliminarySummary = Omit<
  EligibleCandidate["summary"],
  "providerContentTypeId"
> & {
  providerContentTypeId: TourContentTypeId | null;
};

export interface ItineraryGenerationDependencies {
  tourService?: TourPlaceService;
  directions?: (
    request: KakaoDirectionsRequest,
  ) => Promise<KakaoDrivingRoute>;
}

function emptyExclusions(): ItineraryExclusionCounts {
  return {
    shopping_disabled: 0,
    unsupported_record: 0,
    malformed_record: 0,
    malformed_coordinates: 0,
    candidate_limit: 0,
    detail_unavailable: 0,
    detail_mismatch: 0,
    not_allowed: 0,
    unknown: 0,
    not_applicable: 0,
    pet_size_incompatible: 0,
    pet_size_verification_required: 0,
    indoor_requirement: 0,
    closed_at_visit: 0,
    duration_exceeded: 0,
    directions_unavailable: 0,
    diversity_duplicate: 0,
  };
}

function emptyCandidateFunnel(): ItineraryCandidateFunnel {
  return {
    matchingCatalogCandidates: 0,
    afterBasicFilters: 0,
    preliminaryRankedCandidates: 0,
    detailedAssessmentCandidates: 0,
    detailOutcomes: { unavailable: 0, mismatch: 0 },
    basePetAccess: {
      allowed: 0,
      conditional: 0,
      notAllowed: 0,
      unknown: 0,
      notApplicable: 0,
    },
    petSizeCompatibility: {
      compatible: 0,
      incompatible: 0,
      verificationRequired: 0,
      notSpecified: 0,
    },
    indoorRequirementExcluded: 0,
    itineraryEligibleCandidates: 0,
    returnedRoutes: 0,
  };
}

function stableRequestHash(request: NormalizedItineraryRequest): string {
  const value = getItineraryGenerationRequestKey(request);
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(values[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function isUsableCoordinate(value: number | null, max: number): value is number {
  return value !== null && Number.isFinite(value) && Math.abs(value) <= max;
}

function isEligibleCatalogSummary(
  place: TourPlaceSummary,
  requestedCategory: TourCatalogCategory,
  requestedType: TourContentTypeId,
): place is PreliminarySummary {
  return (
    Boolean(place.title?.trim()) &&
    place.contentTypeId === requestedType &&
    (place.providerContentTypeId === null ||
      place.providerContentTypeId === requestedType) &&
    place.category === requestedCategory &&
    TOUR_ITINERARY_ELIGIBLE_CONTENT_TYPE_IDS.includes(requestedType) &&
    place.source.operation === "areaBasedList2" &&
    isUsableCoordinate(place.latitude, 90) &&
    isUsableCoordinate(place.longitude, 180)
  );
}

function compareByStartDistance(
  request: NormalizedItineraryRequest,
  left: PreliminarySummary,
  right: PreliminarySummary,
): number {
  const distance =
    haversineKm(request.start.coordinates, {
      latitude: left.latitude,
      longitude: left.longitude,
    }) -
    haversineKm(request.start.coordinates, {
      latitude: right.latitude,
      longitude: right.longitude,
    });
  return distance || left.contentId.localeCompare(right.contentId);
}

function detailMatchesCatalog(
  detail: TourPlaceDetail,
  summary: PreliminarySummary,
): boolean {
  return (
    detail.summary.contentId === summary.contentId &&
    detail.summary.contentTypeId === summary.contentTypeId &&
    detail.summary.providerContentTypeId === summary.contentTypeId &&
    (summary.providerContentTypeId === null ||
      detail.summary.providerContentTypeId === summary.providerContentTypeId) &&
    detail.summary.category === summary.category
  );
}

function getPetSizeSourceEvidence(
  detail: TourPlaceDetail,
): PetSizeSourceEvidence[] {
  const primary = detail.petPolicyEvidence
    ? Object.entries(detail.petPolicyEvidence.fields).flatMap(
        ([field, sourceText]) =>
          sourceText
            ? [
                {
                  id: `detailPetTour2:${field}:source`,
                  sourceText,
                },
              ]
            : [],
      )
    : [];
  const fallback = detail.introPetPolicyEvidence
    ? [
        {
          id: `detailIntro2:${detail.introPetPolicyEvidence.field}:source`,
          sourceText: detail.introPetPolicyEvidence.value,
        },
      ]
    : [];
  return [...primary, ...fallback];
}

function supportsRequiredIndoorAccess(
  assessment: TourPetAccessSemanticAssessment,
): boolean {
  if (
    assessment.restrictedScopes.includes("indoor") ||
    assessment.conditions.some(
      ({ type }) => type === "outdoor_only" || type === "indoor_restricted",
    )
  ) {
    return false;
  }
  return assessment.permittedScopes.some((scope) =>
    [
      "whole_place",
      "indoor",
      "guest_room",
      "selected_room",
      "common_area",
      "restaurant",
      "cafe",
      "lobby",
    ].includes(scope),
  );
}

function compareEligibleCandidates(
  request: NormalizedItineraryRequest,
  left: EligibleCandidate,
  right: EligibleCandidate,
): number {
  const indoorPreference =
    request.indoorAccessPreference === "preferred"
      ? Number(supportsRequiredIndoorAccess(right.assessment)) -
        Number(supportsRequiredIndoorAccess(left.assessment))
      : 0;
  return (
    indoorPreference ||
    compareByStartDistance(request, left.summary, right.summary)
  );
}

function candidateCoordinates(candidate: EligibleCandidate) {
  return {
    latitude: candidate.summary.latitude,
    longitude: candidate.summary.longitude,
  };
}

function orderNearest(
  candidates: EligibleCandidate[],
  request: NormalizedItineraryRequest,
): EligibleCandidate[] {
  const remaining = [...candidates];
  const ordered: EligibleCandidate[] = [];
  let current = request.start.coordinates;
  while (remaining.length > 0) {
    remaining.sort(
      (left, right) =>
        haversineKm(current, candidateCoordinates(left)) -
          haversineKm(current, candidateCoordinates(right)) ||
        left.summary.contentId.localeCompare(right.summary.contentId),
    );
    const next = remaining.shift();
    if (!next) break;
    ordered.push(next);
    current = candidateCoordinates(next);
  }
  return ordered;
}

function chooseMinimumTravel(
  candidates: EligibleCandidate[],
  request: NormalizedItineraryRequest,
  variant: number,
): EligibleCandidate[] {
  const sorted = [...candidates].sort((left, right) =>
    compareEligibleCandidates(request, left, right),
  );
  const shifted = sorted.slice(variant).concat(sorted.slice(0, variant));
  return orderNearest(
    shifted.slice(0, request.desiredStopCount),
    request,
  );
}

function chooseBalanced(
  candidates: EligibleCandidate[],
  request: NormalizedItineraryRequest,
  variant: number,
): EligibleCandidate[] {
  const categoryOrder = request.selectedCategories.filter(
    (category): category is TourCatalogCategory =>
      category !== "shopping" || request.includeShopping,
  );
  const rotated = categoryOrder
    .slice(variant % Math.max(1, categoryOrder.length))
    .concat(categoryOrder.slice(0, variant % Math.max(1, categoryOrder.length)));
  const selected: EligibleCandidate[] = [];
  const used = new Set<string>();
  const add = (candidate: EligibleCandidate | undefined) => {
    if (!candidate || used.has(candidate.summary.contentId)) return;
    selected.push(candidate);
    used.add(candidate.summary.contentId);
  };
  if (categoryOrder.includes("food")) {
    const foods = candidates
      .filter(({ summary }) => summary.category === "food")
      .sort((left, right) => compareEligibleCandidates(request, left, right));
    add(foods[variant % Math.max(1, foods.length)]);
  }
  let pass = 0;
  while (selected.length < request.desiredStopCount && pass < candidates.length) {
    for (const category of rotated) {
      const matches = candidates
        .filter(
          ({ summary }) =>
            summary.category === category && !used.has(summary.contentId),
        )
        .sort((left, right) => compareEligibleCandidates(request, left, right));
      add(matches[(variant + pass) % Math.max(1, matches.length)]);
      if (selected.length >= request.desiredStopCount) break;
    }
    pass += 1;
  }
  for (const candidate of candidates) {
    if (selected.length >= request.desiredStopCount) break;
    add(candidate);
  }
  return orderNearest(selected, request);
}

function chooseWalkLeisure(
  candidates: EligibleCandidate[],
  request: NormalizedItineraryRequest,
  variant: number,
): EligibleCandidate[] {
  const priority: TourCatalogCategory[] = [
    "leisure",
    "attraction",
    ...request.selectedCategories.filter(
      (category): category is TourCatalogCategory =>
        category !== "leisure" &&
        category !== "attraction" &&
        (category !== "shopping" || request.includeShopping),
    ),
  ];
  const sorted = [...candidates].sort((left, right) => {
    const category =
      priority.indexOf(left.summary.category) -
      priority.indexOf(right.summary.category);
    return (
      category || compareEligibleCandidates(request, left, right)
    );
  });
  const shifted = sorted.slice(variant).concat(sorted.slice(0, variant));
  return orderNearest(
    shifted.slice(0, request.desiredStopCount),
    request,
  );
}

function propose(
  profile: ItineraryProfile,
  candidates: EligibleCandidate[],
  request: NormalizedItineraryRequest,
  variant: number,
): EligibleCandidate[] {
  if (profile === "minimum_travel") {
    return chooseMinimumTravel(candidates, request, variant);
  }
  if (profile === "balanced_tour_food") {
    return chooseBalanced(candidates, request, variant);
  }
  return chooseWalkLeisure(candidates, request, variant);
}

function jaccardOverlap(
  left: readonly EligibleCandidate[],
  right: readonly EligibleCandidate[],
): number {
  const leftIds = new Set(left.map(({ summary }) => summary.contentId));
  const rightIds = new Set(right.map(({ summary }) => summary.contentId));
  const intersection = [...leftIds].filter((id) => rightIds.has(id)).length;
  const union = new Set([...leftIds, ...rightIds]).size;
  return union === 0 ? 1 : intersection / union;
}

function toDirectionsRequest(
  candidates: EligibleCandidate[],
  request: NormalizedItineraryRequest,
): KakaoDirectionsRequest {
  const points = candidates.map(({ summary }) => ({
    name: summary.title.slice(0, 80),
    x: summary.longitude,
    y: summary.latitude,
  }));
  const destination = points.at(-1);
  if (!destination) throw new Error("No itinerary destination");
  return {
    origin: {
      name: request.start.label ?? "출발지",
      x: request.start.coordinates.longitude,
      y: request.start.coordinates.latitude,
    },
    destination,
    waypoints: points.slice(0, -1),
  };
}

function minutesFromTime(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeFromMinutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(
    value % 60,
  ).padStart(2, "0")}`;
}

function createItinerary(
  profile: ItineraryProfile,
  candidates: EligibleCandidate[],
  route: KakaoDrivingRoute,
  request: NormalizedItineraryRequest,
  exclusions: ItineraryExclusionCounts,
): GeneratedItinerary | null {
  if (route.sections.length !== candidates.length) {
    exclusions.directions_unavailable += 1;
    return null;
  }
  const visits = candidates.reduce(
    (total, candidate) => total + VISIT_DURATION_MINUTES[candidate.summary.category],
    0,
  );
  const elapsed = Math.ceil(route.totalDurationSeconds / 60) + visits;
  const start = minutesFromTime(request.startTime);
  if (
    start + elapsed > 24 * 60 ||
    (request.desiredDurationMinutes !== null &&
      elapsed > request.desiredDurationMinutes)
  ) {
    exclusions.duration_exceeded += 1;
    return null;
  }

  let cursor = start;
  const stops: GeneratedItineraryStop[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const section = route.sections[index];
    cursor += Math.ceil(section.durationSeconds / 60);
    const visitDuration = VISIT_DURATION_MINUTES[candidate.summary.category];
    const departure = cursor + visitDuration;
    const hours = assessOperatingHours({
      travelDate: request.travelDate,
      arrivalMinutes: cursor,
      departureMinutes: departure,
      operatingInformation: candidate.detail.operatingInformation,
      restDayInformation: candidate.detail.restDayInformation,
    });
    if (hours.status === "closed") {
      exclusions.closed_at_visit += 1;
      return null;
    }
    stops.push({
      order: index + 1,
      contentId: candidate.summary.contentId,
      title: candidate.summary.title,
      address: candidate.summary.address,
      coordinates: candidateCoordinates(candidate),
      providerContentTypeId: candidate.summary.providerContentTypeId,
      contentTypeId: candidate.summary.contentTypeId,
      category: candidate.summary.category,
      plannedArrival: timeFromMinutes(cursor),
      plannedDeparture: timeFromMinutes(departure),
      visitDurationMinutes: visitDuration,
      distanceFromPreviousMeters: section.distanceMeters,
      durationFromPreviousSeconds: section.durationSeconds,
      petAccess: {
        verdict: candidate.assessment.verdict,
        evaluationState: candidate.assessment.evaluationState,
        permittedScopes: candidate.assessment.permittedScopes,
        restrictedScopes: candidate.assessment.restrictedScopes,
        conditions: candidate.assessment.conditions,
        sizeCompatibility: candidate.sizeCompatibility,
      },
      operatingHours: {
        status: hours.status,
        warning: hours.warning,
      },
    });
    cursor = departure;
  }

  return {
    id: `${stableRequestHash(request)}:${profile}:${candidates
      .map(({ summary }) => summary.contentId)
      .join("-")}`,
    profile,
    ...PROFILE_COPY[profile],
    stops,
    totalDistanceMeters: route.totalDistanceMeters,
    totalDurationSeconds: route.totalDurationSeconds,
    estimatedElapsedDurationMinutes: elapsed,
    geometry: route.coordinates,
  };
}

function unavailableResponse(
  request: NormalizedItineraryRequest,
  exclusions: ItineraryExclusionCounts,
  notice: string,
): ItineraryGenerationResponse {
  const candidateFunnel = emptyCandidateFunnel();
  return {
    state: "provider_unavailable",
    request,
    providerCandidatesConsidered: 0,
    shortlistedCandidates: 0,
    eligibleCandidates: 0,
    candidateFunnel,
    exclusionCounts: exclusions,
    providerCalls: { detail: 0, directions: 0 },
    limits: ITINERARY_GENERATION_LIMITS,
    itineraries: [],
    notices: [notice],
  };
}

export async function generateItineraries(
  request: NormalizedItineraryRequest,
  dependencies: ItineraryGenerationDependencies = {},
): Promise<ItineraryGenerationResponse> {
  const service = dependencies.tourService ?? getDefaultTourService();
  const routeDirections = dependencies.directions ?? getDirections;
  const exclusions = emptyExclusions();
  const candidateFunnel = emptyCandidateFunnel();
  const notices: string[] = [];
  const requestedCategories = request.selectedCategories.filter(
    (category): category is TourCatalogCategory => {
      if (category === "shopping" && !request.includeShopping) {
        exclusions.shopping_disabled = 1;
        return false;
      }
      return category !== "transportation" && category !== "unknown";
    },
  );
  if (exclusions.shopping_disabled > 0) {
    notices.push("쇼핑은 includeShopping이 true일 때만 일정 후보에 포함됩니다.");
  }

  let catalogResults: Array<{
    category: TourCatalogCategory;
    contentTypeId: TourContentTypeId;
    places: TourPlaceSummary[];
    totalCount: number;
  }>;
  try {
    catalogResults = await mapWithConcurrency(
      requestedCategories,
      ITINERARY_GENERATION_LIMITS.catalogConcurrency,
      async (category) => {
        const contentTypeId = getCatalogContentTypeId(category);
        if (!contentTypeId) {
          return { category, contentTypeId: "12" as const, places: [], totalCount: 0 };
        }
        const result = await collectTourCatalog(service, {
          regionCode: request.scope.regionCode,
          districtCode:
            request.scope.type === "district"
              ? (request.scope.districtCode as BusanDistrictCode)
              : undefined,
          contentTypeId,
        });
        return {
          category,
          contentTypeId,
          places: result.places,
          totalCount: result.totalCount,
        };
      },
    );
  } catch {
    return unavailableResponse(
      request,
      exclusions,
      "한국관광공사 장소 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }

  const matchingCatalog = new Map<
    string,
    {
      place: TourPlaceSummary;
      category: TourCatalogCategory;
      contentTypeId: TourContentTypeId;
    }
  >();
  for (const result of catalogResults) {
    for (const place of result.places) {
      if (!matchingCatalog.has(place.contentId)) {
        matchingCatalog.set(place.contentId, {
          place,
          category: result.category,
          contentTypeId: result.contentTypeId,
        });
      }
    }
  }
  candidateFunnel.matchingCatalogCandidates = matchingCatalog.size;

  const validCatalog: PreliminarySummary[] = [];
  for (const { place, category, contentTypeId } of matchingCatalog.values()) {
      if (!place.title?.trim()) {
        exclusions.malformed_record += 1;
      } else if (
        !isUsableCoordinate(place.latitude, 90) ||
        !isUsableCoordinate(place.longitude, 180)
      ) {
        exclusions.malformed_coordinates += 1;
      } else if (
        !isEligibleCatalogSummary(
          place,
          category,
          contentTypeId,
        )
      ) {
        exclusions.unsupported_record += 1;
      } else {
        validCatalog.push(place);
      }
  }
  candidateFunnel.afterBasicFilters = validCatalog.length;

  validCatalog.sort((left, right) =>
    compareByStartDistance(request, left, right),
  );
  const boundedCatalog = validCatalog.slice(
    0,
    ITINERARY_GENERATION_LIMITS.maxCatalogCandidates,
  );
  candidateFunnel.preliminaryRankedCandidates = boundedCatalog.length;
  const shortlist = boundedCatalog.slice(
    0,
    ITINERARY_GENERATION_LIMITS.maxDetailCalls,
  );
  candidateFunnel.detailedAssessmentCandidates = shortlist.length;
  exclusions.candidate_limit += Math.max(0, validCatalog.length - shortlist.length);

  let detailCalls = 0;
  const detailResults = await mapWithConcurrency(
    shortlist,
    ITINERARY_GENERATION_LIMITS.detailConcurrency,
    async (summary) => {
      detailCalls += 1;
      try {
        const detail = await service.getPlaceDetail(
          summary.contentId,
          summary.contentTypeId,
        );
        return { summary, detail } as const;
      } catch {
        return { summary, detail: null } as const;
      }
    },
  );

  const eligible: EligibleCandidate[] = [];
  for (const result of detailResults) {
    if (!result.detail) {
      exclusions.detail_unavailable += 1;
      candidateFunnel.detailOutcomes.unavailable += 1;
      continue;
    }
    const assessment = evaluateTourPetAccess(
      createTrustedTourPetAccessInput(result.detail),
    );
    if (assessment.evaluationState === "not_applicable") {
      exclusions.not_applicable += 1;
      candidateFunnel.basePetAccess.notApplicable += 1;
      continue;
    }
    if (!detailMatchesCatalog(result.detail, result.summary)) {
      exclusions.detail_mismatch += 1;
      candidateFunnel.detailOutcomes.mismatch += 1;
      continue;
    }
    if (assessment.verdict === "not_allowed") {
      exclusions.not_allowed += 1;
      candidateFunnel.basePetAccess.notAllowed += 1;
      continue;
    }
    if (assessment.verdict === "unknown") {
      exclusions.unknown += 1;
      candidateFunnel.basePetAccess.unknown += 1;
      continue;
    }
    candidateFunnel.basePetAccess[assessment.verdict] += 1;
    const sizeCompatibility = assessPetSizeCompatibility(
      assessment,
      request.petSize,
      getPetSizeSourceEvidence(result.detail),
    );
    if (sizeCompatibility.state === "compatible") {
      candidateFunnel.petSizeCompatibility.compatible += 1;
    } else if (sizeCompatibility.state === "incompatible") {
      exclusions.pet_size_incompatible += 1;
      candidateFunnel.petSizeCompatibility.incompatible += 1;
      continue;
    } else if (sizeCompatibility.state === "verification_required") {
      exclusions.pet_size_verification_required += 1;
      candidateFunnel.petSizeCompatibility.verificationRequired += 1;
      continue;
    } else {
      candidateFunnel.petSizeCompatibility.notSpecified += 1;
    }
    if (
      request.indoorAccessPreference === "required" &&
      !supportsRequiredIndoorAccess(assessment)
    ) {
      exclusions.indoor_requirement += 1;
      candidateFunnel.indoorRequirementExcluded += 1;
      continue;
    }
    eligible.push({
      summary: {
        ...result.summary,
        providerContentTypeId: result.detail.summary
          .providerContentTypeId as TourContentTypeId,
      },
      detail: result.detail,
      assessment: assessment as EligibleCandidate["assessment"],
      sizeCompatibility,
    });
  }
  candidateFunnel.itineraryEligibleCandidates = eligible.length;
  if (exclusions.pet_size_incompatible > 0) {
    notices.push(
      `선택한 반려견 크기와 명시된 시설 조건이 맞지 않는 후보 ${exclusions.pet_size_incompatible}곳을 자동 일정에서 제외했습니다.`,
    );
  }
  if (exclusions.pet_size_verification_required > 0) {
    notices.push(
      `kg 기준 또는 모호한 크기 제한이 있는 후보 ${exclusions.pet_size_verification_required}곳은 정확한 체중·시설 확인이 필요해 자동 일정에서 제외했습니다.`,
    );
  }

  if (request.indoorAccessPreference === "preferred") {
    eligible.sort(
      (left, right) =>
        Number(supportsRequiredIndoorAccess(right.assessment)) -
          Number(supportsRequiredIndoorAccess(left.assessment)) ||
        compareByStartDistance(request, left.summary, right.summary),
    );
  }

  let directionsCalls = 0;
  const itineraries: GeneratedItinerary[] = [];
  const acceptedCandidates: EligibleCandidate[][] = [];
  const proposedSets = new Set<string>();
  const profiles: ItineraryProfile[] = [
    "minimum_travel",
    "balanced_tour_food",
    "walk_leisure",
  ];

  if (eligible.length >= request.desiredStopCount) {
    for (const profile of profiles) {
      for (let variant = 0; variant < PROFILE_VARIANTS; variant += 1) {
        if (
          directionsCalls >= ITINERARY_GENERATION_LIMITS.maxDirectionsCalls ||
          itineraries.some((itinerary) => itinerary.profile === profile)
        ) {
          break;
        }
        const proposal = propose(profile, eligible, request, variant);
        if (proposal.length < request.desiredStopCount) continue;
        const setKey = proposal
          .map(({ summary }) => summary.contentId)
          .sort()
          .join("|");
        if (proposedSets.has(setKey)) {
          exclusions.diversity_duplicate += 1;
          continue;
        }
        proposedSets.add(setKey);
        if (
          acceptedCandidates.some(
            (accepted) =>
              jaccardOverlap(accepted, proposal) >
              MAX_ITINERARY_JACCARD_OVERLAP,
          )
        ) {
          exclusions.diversity_duplicate += 1;
          continue;
        }
        directionsCalls += 1;
        let route: KakaoDrivingRoute;
        try {
          route = await routeDirections(toDirectionsRequest(proposal, request));
        } catch {
          exclusions.directions_unavailable += 1;
          continue;
        }
        const itinerary = createItinerary(
          profile,
          proposal,
          route,
          request,
          exclusions,
        );
        if (!itinerary) continue;
        itineraries.push(itinerary);
        acceptedCandidates.push(proposal);
      }
    }
  }

  if (itineraries.length < 3) {
    notices.push(
      `조건과 다양성 기준을 충족한 실제 경로가 ${itineraries.length}개여서 빈 슬롯을 만들지 않았습니다.`,
    );
  }
  const upstreamFailures =
    exclusions.detail_unavailable + exclusions.directions_unavailable;
  const state: ItineraryGenerationResponse["state"] =
    itineraries.length > 0
      ? upstreamFailures > 0
        ? "partial"
        : "ready"
      : detailCalls > 0 && exclusions.detail_unavailable === detailCalls
        ? "provider_unavailable"
        : eligible.length >= request.desiredStopCount &&
            exclusions.directions_unavailable > 0
          ? "provider_unavailable"
          : "insufficient_candidates";

  if (state === "provider_unavailable") {
    notices.push(
      "장소 상세 또는 Kakao 길찾기 제공자 응답을 사용할 수 없어 경로를 확정하지 못했습니다.",
    );
  } else if (state === "insufficient_candidates") {
    notices.push(
      "현재 요청에서 지원되는 반려동물 동반 근거와 필수 조건을 충족한 장소가 부족합니다.",
    );
  }
  candidateFunnel.returnedRoutes = itineraries.length;

  return {
    state,
    request,
    providerCandidatesConsidered: candidateFunnel.matchingCatalogCandidates,
    shortlistedCandidates: shortlist.length,
    eligibleCandidates: eligible.length,
    candidateFunnel,
    exclusionCounts: exclusions,
    providerCalls: { detail: detailCalls, directions: directionsCalls },
    limits: ITINERARY_GENERATION_LIMITS,
    itineraries,
    notices,
  };
}
