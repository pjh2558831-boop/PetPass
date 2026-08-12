import "server-only";

import { haversineKm } from "@/lib/itinerary/optimizer";
import { classifyTourTravelSuitability } from "@/lib/itinerary/travel-suitability";
import { CANDIDATE_PIPELINE_V1_CONFIG } from "@/lib/recommendation/config/candidate-pipeline-v1";
import { reserveCandidateCategoriesV1 } from "@/lib/recommendation/retrieval/category-reservation";
import { scoreRetrievalCandidateV1 } from "@/lib/recommendation/scoring/retrieval-score";
import type {
  CachedDetailStatus,
  CandidatePipelineRequestContext,
  LightweightRouteCandidate,
  UsefulTourCategory,
} from "@/lib/recommendation/types";
import type { TourPlaceSummary } from "@/types/place";

export interface StageARetrievalInput {
  catalog: readonly TourPlaceSummary[];
  context: CandidatePipelineRequestContext;
  /** Immutable pipeline snapshot time used for visibility freshness checks. */
  asOf: string;
  popularityPrior?: ReadonlyMap<string, number>;
  cachedDetailStatus?: ReadonlyMap<string, CachedDetailStatus>;
}

export function filterStageZeroCatalogV1(
  catalog: readonly TourPlaceSummary[],
  context: CandidatePipelineRequestContext,
  asOf: string,
): TourPlaceSummary[] {
  const selectedCategories = [
    ...new Set(context.request.selectedCategories),
  ].filter(isUsefulCategory);
  const accepted = catalog.filter(
    (place) =>
      getStageZeroRejectionReasonsV1(
        place,
        context,
        asOf,
        selectedCategories,
      ).length === 0,
  );
  const byContentId = new Map<string, TourPlaceSummary[]>();
  for (const place of accepted) {
    const values = byContentId.get(place.contentId) ?? [];
    values.push(place);
    byContentId.set(place.contentId, values);
  }
  return [...byContentId.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, values]) => {
      const fingerprints = new Set(values.map(stageZeroFingerprint));
      // Conflicting duplicate identities are not resolved by input order.
      // Stage 0 fails them closed; byte-equivalent duplicates collapse to one.
      return fingerprints.size === 1 ? [values[0]] : [];
    });
}

function stageZeroFingerprint(place: TourPlaceSummary): string {
  return JSON.stringify([
    place.contentId,
    place.contentTypeId,
    place.providerContentTypeId,
    place.category,
    place.title,
    place.address,
    place.phone,
    place.thumbnailUrl,
    place.imageUrl,
    place.modifiedTime,
    place.latitude,
    place.longitude,
    place.legalRegionCode,
    place.legalDistrictCode,
    place.providerVisibility?.status,
    place.providerVisibility?.providerField,
    place.providerVisibility?.providerValue,
    place.providerVisibility?.checkedAt,
    place.source.provider,
    place.source.operation,
    place.source.contentId,
  ]);
}

function isUsefulCategory(value: string): value is UsefulTourCategory {
  return [
    "attraction",
    "culture",
    "festival",
    "leisure",
    "accommodation",
    "food",
    "shopping",
  ].includes(value);
}

function listDataQuality(place: TourPlaceSummary): number {
  const fields = [
    place.title,
    place.address,
    place.phone,
    place.thumbnailUrl ?? place.imageUrl,
    place.modifiedTime,
  ];
  return fields.filter((value) => Boolean(value?.trim())).length / fields.length;
}

function validCoordinate(value: number | null, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function inScope(
  place: TourPlaceSummary,
  context: CandidatePipelineRequestContext,
): boolean {
  const { scope } = context.tripRequest;
  if (
    !validCoordinate(place.latitude, -90, 90) ||
    !validCoordinate(place.longitude, -180, 180) ||
    (place.latitude === 0 && place.longitude === 0) ||
    place.latitude < scope.bounds.south ||
    place.latitude > scope.bounds.north ||
    place.longitude < scope.bounds.west ||
    place.longitude > scope.bounds.east
  ) {
    return false;
  }
  if (place.legalRegionCode !== scope.regionCode) return false;
  return scope.districtCode === null || place.legalDistrictCode === scope.districtCode;
}

function visibilityTimestampStatus(
  checkedAt: string,
  asOf: string,
): "fresh" | "stale" | "invalid" {
  const checked = Date.parse(checkedAt);
  const snapshot = Date.parse(asOf);
  if (!Number.isFinite(checked) || !Number.isFinite(snapshot) || checked > snapshot) {
    return "invalid";
  }
  return snapshot - checked <= CANDIDATE_PIPELINE_V1_CONFIG.visibilityFreshnessMs
    ? "fresh"
    : "stale";
}

export function hasFreshExposedProviderVisibilityV1(
  place: TourPlaceSummary,
  asOf: string,
): boolean {
  const visibility = place.providerVisibility;
  return Boolean(
    visibility?.status === "exposed" &&
      visibility.providerField === "showflag" &&
      visibility.providerValue === "1" &&
      visibilityTimestampStatus(visibility.checkedAt, asOf) === "fresh",
  );
}

/**
 * V1 uses only explicit list/request facts. Category and exact scope are full
 * matches after Stage 0. Indoor and pet-profile fit remain neutral because the
 * list response has no access evidence. Trip type differentiates only lodging:
 * accommodation is an overnight match and a day-trip mismatch; other types are
 * neutral. Pace changes the retrieval proximity scale, not an invented place
 * characteristic.
 */
export function preferenceFitV1(
  place: TourPlaceSummary,
  context: CandidatePipelineRequestContext,
): number {
  const categoryMatch = context.request.selectedCategories.includes(place.category)
    ? 1
    : 0;
  const geographicMatch = inScope(place, context) ? 1 : 0;
  const tripTypeFit = place.category === "accommodation"
    ? context.tripType === "OVERNIGHT"
      ? 1
      : 0
    : 0.5;
  const indoorPreferenceFit = 0.5;
  const petProfileFit = 0.5;
  return (
    0.4 * categoryMatch +
    0.2 * geographicMatch +
    0.2 * tripTypeFit +
    0.1 * indoorPreferenceFit +
    0.1 * petProfileFit
  );
}

export function getStageZeroRejectionReasonsV1(
  place: TourPlaceSummary,
  context: CandidatePipelineRequestContext,
  asOf: string,
  selectedCategories: readonly UsefulTourCategory[] = [
    ...new Set(context.request.selectedCategories),
  ].filter(isUsefulCategory),
): string[] {
  const reasons = new Set<string>();
  const visibility = place.providerVisibility;
  if (visibility?.status === "not_exposed") {
    reasons.add("provider_visibility_not_exposed");
  } else if (visibility?.status === "provider_unavailable") {
    reasons.add("provider_visibility_unavailable");
  } else if (
    visibility?.status !== "exposed" ||
    visibility.providerField !== "showflag" ||
    visibility.providerValue !== "1"
  ) {
    reasons.add("provider_visibility_unknown");
  } else {
    const freshness = visibilityTimestampStatus(visibility.checkedAt, asOf);
    if (freshness === "stale") reasons.add("provider_visibility_stale");
    if (freshness === "invalid") reasons.add("provider_visibility_checked_at_invalid");
  }
  if (place.source.provider !== "Korea Tourism Organization") {
    reasons.add("source_not_kto_service2");
  }
  if (
    place.source.operation !== "areaBasedList2" ||
    place.source.contentId !== place.contentId
  ) {
    reasons.add("source_identity_mismatch");
  }
  if (
    place.contentTypeId === null ||
    place.providerContentTypeId !== place.contentTypeId
  ) {
    reasons.add("unsupported_content_type");
  }
  if (!place.title?.trim()) reasons.add("malformed_record");
  if (
    !validCoordinate(place.latitude, -90, 90) ||
    !validCoordinate(place.longitude, -180, 180) ||
    (place.latitude === 0 && place.longitude === 0)
  ) {
    reasons.add("invalid_coordinates");
  } else if (!inScope(place, context)) {
    reasons.add("outside_requested_geographic_scope");
  }
  if (
    !isUsefulCategory(place.category) ||
    !selectedCategories.includes(place.category)
  ) {
    reasons.add("category_not_selected");
  }
  if (place.category === "shopping" && !context.request.includeShopping) {
    reasons.add("shopping_not_explicitly_selected");
  }
  const suitability = classifyTourTravelSuitability(place, context.request);
  if (!suitability.travelSuitable || !suitability.travelRole) {
    reasons.add("travel_unsuitable");
  }
  return [...reasons].sort((left, right) => left.localeCompare(right));
}

export function retrieveStageACandidatesV1(
  input: StageARetrievalInput,
): LightweightRouteCandidate[] {
  const selectedCategories = [
    ...new Set(input.context.request.selectedCategories),
  ].filter(isUsefulCategory);
  const validCatalog = filterStageZeroCatalogV1(
    input.catalog,
    input.context,
    input.asOf,
  );
  const categoryCounts = new Map<UsefulTourCategory, number>();
  for (const place of validCatalog) {
    if (isUsefulCategory(place.category)) {
      categoryCounts.set(place.category, (categoryCounts.get(place.category) ?? 0) + 1);
    }
  }
  const unique = new Map<string, LightweightRouteCandidate>();
  for (const place of validCatalog) {
    if (
      unique.has(place.contentId) ||
      !place.contentTypeId ||
      !isUsefulCategory(place.category) ||
      !place.title
    ) {
      continue;
    }
    const travelSuitability = classifyTourTravelSuitability(
      place,
      input.context.request,
    );
    if (!travelSuitability.travelSuitable || !travelSuitability.travelRole) {
      continue;
    }
    const latitude = place.latitude as number;
    const longitude = place.longitude as number;
    const distanceKm = haversineKm(input.context.request.start.coordinates, {
      latitude,
      longitude,
    });
    const score = scoreRetrievalCandidateV1({
      preferenceFit: preferenceFitV1(place, input.context),
      proximity:
        1 /
        (1 +
          distanceKm /
            (CANDIDATE_PIPELINE_V1_CONFIG.balancedProximityScaleKm *
              input.context.maxStops) /
            CANDIDATE_PIPELINE_V1_CONFIG.balancedMaxStops),
      categoryCoverageNeed: 1 / Math.max(1, categoryCounts.get(place.category) ?? 1),
      listDataQuality: listDataQuality(place),
      popularityPrior: input.popularityPrior?.get(place.contentId) ?? 0.5,
    });
    unique.set(place.contentId, {
      contentId: place.contentId,
      contentTypeId: place.contentTypeId,
      title: place.title,
      coordinates: { latitude, longitude },
      region: {
        regionCode: place.legalRegionCode as string,
        districtCode: place.legalDistrictCode,
      },
      providerVisibility: "exposed",
      source: "tourism_service2",
      category: place.category,
      summary: place,
      travelSuitability,
      distanceKm,
      listDataQuality: score.listDataQuality,
      cachedDetailStatus:
        input.cachedDetailStatus?.get(place.contentId) ?? "missing",
      retrievalScore: score,
    });
  }
  return reserveCandidateCategoriesV1({
    candidates: [...unique.values()],
    limit: CANDIDATE_PIPELINE_V1_CONFIG.stageALimit,
    selectedCategories,
    tripType: input.context.tripType,
  });
}
