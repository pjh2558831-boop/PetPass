import { mapCatalogPlaceToCategory, type PlaceCategory } from "@/lib/map-places/place-categories";
import type { PublicCatalogMarker, PublicCatalogPlace } from "@/types/public-catalog-place";

const DAY_MS = 86_400_000;

export interface CatalogRankingCenter {
  latitude: number;
  longitude: number;
}

export interface CatalogRecommendationComponents {
  categoryAndFilterFit: number;
  petEvidenceConfidence: number;
  proximity: number;
  dataCompleteness: number;
  freshness: number;
  discoveryStrength: number;
}

export interface CatalogRecommendationResult {
  score: number;
  components: CatalogRecommendationComponents;
  distanceMeters: number | null;
  version: "catalog-recommendation-v1";
}

export interface CatalogPopularityResult {
  score: number;
  status: "sufficient_data" | "insufficient_data";
  version: "popularity-v1";
}

export interface CatalogRankingContext {
  activeCategories: readonly PlaceCategory[];
  districtSelected: boolean;
  committedBoundsSelected: boolean;
  center: CatalogRankingCenter | null;
  asOf: string;
  popularity?: ReadonlyMap<string, CatalogPopularityResult>;
}

export interface RankedCatalogPlace {
  place: PublicCatalogMarker;
  recommendation: CatalogRecommendationResult;
  popularity: CatalogPopularityResult;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(1_000, Math.round(value * 1_000)));
}

function distanceMeters(
  left: CatalogRankingCenter,
  right: CatalogRankingCenter,
): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const latitude1 = radians(left.latitude);
  const latitude2 = radians(right.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getPetEvidenceConfidence(place: PublicCatalogMarker, active: ReadonlySet<PlaceCategory>): number {
  const category = mapCatalogPlaceToCategory(place);
  if (place.layer === "kakao") return 0.2;
  if (place.layer === "veterinary" || place.layer === "pet_shop") {
    return active.has(category) ? 0.55 : 0;
  }
  if (place.publicLabel === "동반 가능") return 1;
  if (place.publicLabel.includes("조건")) return 0.65;
  return 0.4;
}

function getCompleteness(place: PublicCatalogMarker): number {
  if (place.completeness !== undefined) return place.completeness;
  const card = place as Partial<PublicCatalogPlace>;
  const facts = [
    Boolean(place.address && place.address !== "주소 확인 필요"),
    Boolean(place.coordinates),
    Boolean(card.phone),
    Boolean(place.category),
    Boolean(card.imageUrl),
    Boolean(card.approvedImageUrl),
  ];
  return facts.filter(Boolean).length / facts.length;
}

function getFreshness(place: PublicCatalogMarker, asOf: string): number {
  const asOfMs = Date.parse(asOf);
  const observedMs = Date.parse(place.lastSeenAt ?? "");
  if (!Number.isFinite(asOfMs) || !Number.isFinite(observedMs) || observedMs > asOfMs) return 0.5;
  const ageDays = (asOfMs - observedMs) / DAY_MS;
  return clamp(0.5 ** (ageDays / 180));
}

function getDiscoveryStrength(place: PublicCatalogMarker): number {
  if (place.layer !== "kakao") return 0.5;
  const matchedQueryCount = place.matchedQueryCount ?? 0;
  const categoryQueryAgreementCount = place.categoryQueryAgreementCount ?? 0;
  const hitStrength = clamp(matchedQueryCount / 4);
  const agreement = matchedQueryCount > 0
    ? clamp(categoryQueryAgreementCount / matchedQueryCount)
    : 0;
  return 0.7 * hitStrength + 0.3 * agreement;
}

export function calculateCatalogRecommendationV1(
  place: PublicCatalogMarker,
  context: CatalogRankingContext,
): CatalogRecommendationResult {
  const active = new Set(context.activeCategories);
  const category = mapCatalogPlaceToCategory(place);
  const filterSpecificity = Number(context.districtSelected) + Number(context.committedBoundsSelected);
  const categoryAndFilterFit = clamp((active.has(category) ? 0.8 : 0) + filterSpecificity * 0.1);
  const petEvidenceConfidence = getPetEvidenceConfidence(place, active);
  const rawDistance = context.center && place.coordinates
    ? distanceMeters(context.center, place.coordinates)
    : null;
  const proximity = rawDistance === null ? 0.5 : clamp(1 / (1 + rawDistance / 5_000));
  const dataCompleteness = getCompleteness(place);
  const freshness = getFreshness(place, context.asOf);
  const discoveryStrength = getDiscoveryStrength(place);
  const components = {
    categoryAndFilterFit,
    petEvidenceConfidence,
    proximity,
    dataCompleteness,
    freshness,
    discoveryStrength,
  };
  const normalized = 0.30 * categoryAndFilterFit +
    0.25 * petEvidenceConfidence +
    0.15 * proximity +
    0.10 * dataCompleteness +
    0.10 * freshness +
    0.10 * discoveryStrength;
  return {
    score: roundScore(normalized),
    components,
    distanceMeters: rawDistance,
    version: "catalog-recommendation-v1",
  };
}

const INSUFFICIENT_POPULARITY: CatalogPopularityResult = {
  score: 0.5,
  status: "insufficient_data",
  version: "popularity-v1",
};

function nameKey(place: PublicCatalogMarker): string {
  return place.name.normalize("NFKC").trim().toLocaleLowerCase("ko");
}

function recommendationTie(left: RankedCatalogPlace, right: RankedCatalogPlace): number {
  return right.recommendation.score - left.recommendation.score ||
    right.recommendation.components.petEvidenceConfidence - left.recommendation.components.petEvidenceConfidence ||
    (left.recommendation.distanceMeters ?? Number.POSITIVE_INFINITY) -
      (right.recommendation.distanceMeters ?? Number.POSITIVE_INFINITY) ||
    nameKey(left.place).localeCompare(nameKey(right.place), "ko") ||
    left.place.providerPlaceId.localeCompare(right.place.providerPlaceId, "en");
}

export function rankCatalogPlaces(
  places: readonly PublicCatalogMarker[],
  context: CatalogRankingContext,
  sort: "recommendation" | "popularity",
): RankedCatalogPlace[] {
  const ranked = places.map((place) => ({
    place,
    recommendation: calculateCatalogRecommendationV1(place, context),
    popularity: context.popularity?.get(place.id) ?? INSUFFICIENT_POPULARITY,
  }));
  return ranked.sort((left, right) => {
    if (sort === "popularity") {
      const statusDifference = Number(right.popularity.status === "sufficient_data") -
        Number(left.popularity.status === "sufficient_data");
      if (statusDifference !== 0) return statusDifference;
      if (left.popularity.status === "sufficient_data" && right.popularity.status === "sufficient_data") {
        const scoreDifference = right.popularity.score - left.popularity.score;
        if (scoreDifference !== 0) return scoreDifference;
      }
    }
    return recommendationTie(left, right);
  });
}
