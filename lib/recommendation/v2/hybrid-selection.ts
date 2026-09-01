import "server-only";

import { haversineKm } from "@/lib/itinerary/optimizer";
import { insufficientEvidencePetConditionEligibility } from "@/lib/pet-access/canonical-condition-eligibility";
import { ROUTE_SOLVER_V1_CONFIG } from "@/lib/recommendation/config/route-solver-v1";
import type { UsefulTourCategory } from "@/lib/recommendation/types";
import type { CanonicalRecommendationCandidateV2 } from "@/lib/recommendation/v2/candidate-fusion";
import type { MapPlacesSnapshotMarker } from "@/types/map-places-snapshot";
import type { TourPlaceSummary } from "@/types/place";
import type { RouteRecommendationRequest } from "@/types/recommendation";
import type { RegionId } from "@/types/region";

export const HYBRID_CANDIDATE_LIMIT = ROUTE_SOLVER_V1_CONFIG.maxCandidates;
export const LARGE_ANCHOR_DETOUR_KM = 35;

export function findPublishedSelectedMarkerV2(input: {
  placeId: string;
  requestedRegionId: RegionId;
  markers: readonly MapPlacesSnapshotMarker[];
}): MapPlacesSnapshotMarker | null {
  return input.markers.find((marker) =>
    marker.id === input.placeId && marker.regionId === input.requestedRegionId
  ) ?? null;
}

function usefulCategory(value: MapPlacesSnapshotMarker["category"]): UsefulTourCategory | null {
  switch (value) {
    case "attraction": return "attraction";
    case "park_walk":
    case "leisure":
    case "camping": return "leisure";
    case "food":
    case "cafe": return "food";
    case "accommodation": return "accommodation";
    case "shopping": return "shopping";
    default: return null;
  }
}

function catalogTier(verdict: MapPlacesSnapshotMarker["petAccessVerdict"]) {
  return verdict === "allowed"
    ? "verified" as const
    : verdict === "conditional"
      ? "conditional" as const
      : "unverified" as const;
}

export function selectedCatalogCandidateV2(
  marker: MapPlacesSnapshotMarker,
): CanonicalRecommendationCandidateV2 | null {
  const category = usefulCategory(marker.category);
  if (!category || !marker.coordinates || marker.petAccessVerdict === "not_allowed") return null;
  const tier = catalogTier(marker.petAccessVerdict);
  const source = marker.layer === "tourism" ? "tourism_service2" as const : "kakao_catalog" as const;
  return {
    canonicalId: marker.id,
    providerIdentities: [{
      provider: marker.layer === "tourism" ? "kto" : "kakao",
      id: marker.providerPlaceId,
    }],
    source,
    sourceLabel: marker.sourceLabel,
    regionId: marker.regionId,
    districtCode: marker.districtCode,
    title: marker.name,
    address: marker.address || null,
    phone: null,
    coordinates: marker.coordinates,
    category,
    environment: "unknown",
    petVerdict: marker.petAccessVerdict === "allowed"
      ? "allowed"
      : marker.petAccessVerdict === "conditional"
        ? "conditional"
        : "unknown",
    catalogPetVerdict: marker.petAccessVerdict,
    petConditions: marker.layer === "kakao" ? marker.petConditions?.trim() || null : null,
    verificationRequired: marker.layer === "kakao"
      ? marker.verificationRequired ?? Boolean(marker.petConditions?.trim())
      : false,
    evidenceStatus: tier,
    eligibilityTier: tier,
    scheduleStatus: "unknown",
    operatingHoursEvidenceState: "verification_required",
    selectionOrigin: "user_selected",
    retrievedAt: marker.lastSeenAt ?? null,
    imageUrl: marker.imageUrl ?? null,
    placeUrl: marker.placeUrl ?? null,
    dataCompleteness: marker.completeness ?? 0.5,
    ktoCandidate: null,
    conditionEligibility: insufficientEvidencePetConditionEligibility(),
  };
}

function validCoordinate(value: number | null | undefined, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

export function selectedShoppingCandidateV2(
  summary: TourPlaceSummary,
  regionId: RegionId,
): CanonicalRecommendationCandidateV2 | null {
  const legacyCoordinates = (summary as TourPlaceSummary & {
    coordinates?: { latitude: number; longitude: number };
  }).coordinates;
  const latitude = summary.latitude ?? legacyCoordinates?.latitude;
  const longitude = summary.longitude ?? legacyCoordinates?.longitude;
  if (
    summary.category !== "shopping" ||
    !validCoordinate(latitude, -90, 90) ||
    !validCoordinate(longitude, -180, 180) ||
    (latitude === 0 && longitude === 0)
  ) return null;
  return {
    canonicalId: `tour:${summary.contentId}`,
    providerIdentities: [{ provider: "kto", id: summary.contentId }],
    source: "tourism_service2",
    sourceLabel: "한국관광공사",
    regionId,
    districtCode: summary.legalDistrictCode,
    title: summary.title?.trim() || `한국관광공사 장소 ${summary.contentId}`,
    address: summary.address,
    phone: summary.phone?.trim() || null,
    coordinates: { latitude, longitude },
    category: "shopping",
    environment: "unknown",
    petVerdict: "unknown",
    catalogPetVerdict: "unknown",
    petConditions: null,
    verificationRequired: true,
    evidenceStatus: "unverified",
    eligibilityTier: "unverified",
    scheduleStatus: "unknown",
    operatingHoursEvidenceState: "verification_required",
    selectionOrigin: "user_selected",
    retrievedAt: summary.source.retrievedAt,
    imageUrl: summary.thumbnailUrl ?? summary.imageUrl,
    placeUrl: null,
    dataCompleteness: 0.5,
    ktoCandidate: null,
    conditionEligibility: insufficientEvidencePetConditionEligibility(),
  };
}

function crossesWindow(start: number, end: number, windowStart: number, windowEnd: number): boolean {
  return start < windowEnd && end > windowStart;
}

export function inferHybridSupplementCategories(input: {
  request: RouteRecommendationRequest;
  selected: readonly CanonicalRecommendationCandidateV2[];
}): Set<UsefulTourCategory> {
  const categories = new Set<UsefulTourCategory>(
    input.request.trip.selectedCategories.filter(
      (category): category is UsefulTourCategory => category !== "shopping",
    ),
  );
  const selectedCategories = new Set(input.selected.map(({ category }) => category));
  const [hours, minutes] = input.request.trip.startTime.split(":").map(Number);
  const start = hours * 60 + minutes;
  const duration = input.request.trip.durationMinutes ??
    ROUTE_SOLVER_V1_CONFIG.pace[input.request.trip.tripPace].maxDurationMinutes;
  const end = start + duration;
  if (
    !selectedCategories.has("food") &&
    (crossesWindow(start, end, 11 * 60 + 30, 13 * 60 + 30) ||
      crossesWindow(start, end, 17 * 60 + 30, 19 * 60 + 30))
  ) categories.add("food");
  if (input.request.trip.tripType === "overnight" && !selectedCategories.has("accommodation")) {
    categories.add("accommodation");
  }
  if (
    duration >= 240 &&
    (input.request.trip.tripPace === "relaxed" ||
      input.request.personalization?.walkingTolerance === "low")
  ) {
    categories.add("leisure");
    categories.add("food");
  }
  return categories;
}

function corridorDistanceKm(
  candidate: CanonicalRecommendationCandidateV2,
  hubs: readonly { latitude: number; longitude: number }[],
): number {
  return Math.min(...hubs.map((hub) => haversineKm(candidate.coordinates, hub)));
}

export function selectHybridShortlist(input: {
  departure: { latitude: number; longitude: number };
  anchors: readonly CanonicalRecommendationCandidateV2[];
  optional: readonly CanonicalRecommendationCandidateV2[];
  desiredCategories: ReadonlySet<UsefulTourCategory>;
  capacity: number;
  personalizationScores?: Readonly<Record<string, number>>;
}): CanonicalRecommendationCandidateV2[] {
  const anchorIds = new Set(input.anchors.map(({ canonicalId }) => canonicalId));
  const selectedCategories = new Set(input.anchors.map(({ category }) => category));
  const hubs = [input.departure, ...input.anchors.map(({ coordinates }) => coordinates)];
  const optionalLimit = Math.max(
    0,
    Math.min(input.capacity - input.anchors.length, HYBRID_CANDIDATE_LIMIT - input.anchors.length),
  );
  const ranked = input.optional
    .filter(({ canonicalId }) => !anchorIds.has(canonicalId))
    .map((candidate) => {
      const categoryGap = input.desiredCategories.has(candidate.category) &&
        !selectedCategories.has(candidate.category);
      const distance = corridorDistanceKm(candidate, hubs);
      const score = (categoryGap ? 1_000 : 0) +
        (candidate.scheduleStatus === "known" ? 120 : 0) +
        (input.personalizationScores?.[candidate.canonicalId] ?? 0) +
        candidate.dataCompleteness * 100 -
        distance * 12 -
        (candidate.eligibilityTier === "conditional" ? 80 : 0);
      return { candidate, score, distance };
    })
    .filter(({ distance }) => distance <= 25)
    .sort((left, right) =>
      right.score - left.score ||
      left.distance - right.distance ||
      left.candidate.canonicalId.localeCompare(right.candidate.canonicalId))
    .slice(0, Math.max(optionalLimit, Math.min(10, HYBRID_CANDIDATE_LIMIT - input.anchors.length)))
    .map(({ candidate }) => candidate);
  return [...input.anchors, ...ranked].slice(0, HYBRID_CANDIDATE_LIMIT);
}

export function hasLargeAnchorDetour(
  departure: { latitude: number; longitude: number },
  anchors: readonly CanonicalRecommendationCandidateV2[],
): boolean {
  const points = [departure, ...anchors.map(({ coordinates }) => coordinates)];
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      if (haversineKm(points[left]!, points[right]!) >= LARGE_ANCHOR_DETOUR_KM) return true;
    }
  }
  return false;
}
