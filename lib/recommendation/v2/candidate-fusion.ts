import "server-only";

import { haversineKm } from "@/lib/itinerary/optimizer";
import {
  eligiblePetConditionEligibility,
  evaluateCanonicalPetConditions,
} from "@/lib/pet-access/canonical-condition-eligibility";
import { coordinatesInRegion, getRegionConfig } from "@/lib/regions/config";
import type { CatalogEvidenceV1 } from "@/types/recommendation";
import type {
  DetailedEligibleCandidate,
  UsefulTourCategory,
} from "@/lib/recommendation/types";
import type { MapPlacesSnapshotMarker } from "@/types/map-places-snapshot";
import type { RegionId } from "@/types/region";
import type {
  AutomaticRoutePetProfile,
  RouteEligibilityTier,
} from "@/types/route-eligibility";
import type { CanonicalPetConditionEligibility } from "@/types/pet-condition-eligibility";

export const CANDIDATE_FUSION_V2_VERSION = "candidate-fusion-v2" as const;

export interface CanonicalProviderIdentityV2 {
  provider: "kto" | "kakao";
  id: string;
}

export interface CanonicalRecommendationCandidateV2 {
  planningPolicy?: "full_public_catalog_v1";
  catalogEvidence?: CatalogEvidenceV1[];
  catalogCategory?: MapPlacesSnapshotMarker["category"];
  canonicalId: string;
  providerIdentities: CanonicalProviderIdentityV2[];
  source: "tourism_service2" | "kakao_catalog";
  sourceLabel: "한국관광공사" | "카카오 검색 후보";
  regionId: RegionId;
  districtCode: string | null;
  title: string;
  address: string | null;
  phone: string | null;
  coordinates: { latitude: number; longitude: number };
  category: UsefulTourCategory;
  environment: "indoor" | "outdoor" | "mixed" | "unknown";
  petVerdict: "allowed" | "conditional" | "not_allowed" | "unknown";
  catalogPetVerdict: "allowed" | "conditional" | "not_allowed" | "unknown";
  petConditions: string | null;
  verificationRequired: boolean;
  evidenceStatus: "verified" | "conditional" | "unverified";
  eligibilityTier: Exclude<RouteEligibilityTier, "explicitly_ineligible">;
  scheduleStatus: "known" | "unknown";
  operatingHoursEvidenceState: "verified" | "verification_required";
  selectionOrigin: "user_selected" | "automatic_fill" | "automatic_recommendation";
  retrievedAt: string | null;
  imageUrl: string | null;
  placeUrl: string | null;
  dataCompleteness: number;
  ktoCandidate: DetailedEligibleCandidate | null;
  conditionEligibility: CanonicalPetConditionEligibility;
}

export interface CandidateFusionV2Diagnostics {
  identities?: Array<{ rawId: string; canonicalId: string | null; outcome: "canonical" | "alias" | "excluded"; reason?: string }>;
  version: typeof CANDIDATE_FUSION_V2_VERSION;
  sourceCounts: { kto: number; kakao: number };
  acceptedSourceCounts: { kto: number; kakao: number };
  crossProviderDuplicatesMerged: number;
  excludedByReason: Record<string, number>;
  stageCounts: {
    providerRawCandidates: number;
    regionFilteredCandidates: number;
    districtFilteredCandidates: number;
    requestedCategoryCandidates: number;
    petEligibleCandidates: number;
    operatingHoursEligibleCandidates: number;
  };
  finalCount: number;
}

function increment(target: Record<string, number>, reason: string): void {
  target[reason] = (target[reason] ?? 0) + 1;
}

function normalizeIdentityText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function safeAddressMatch(left: string | null, right: string): boolean {
  if (!left) return false;
  const a = normalizeIdentityText(left);
  const b = normalizeIdentityText(right);
  if (a.length < 10 || b.length < 10) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function usefulCategory(
  value: MapPlacesSnapshotMarker["category"],
): UsefulTourCategory | null {
  switch (value) {
    case "attraction":
      return "attraction";
    case "park_walk":
    case "leisure":
    case "camping":
      return "leisure";
    case "food":
    case "cafe":
      return "food";
    case "accommodation":
      return "accommodation";
    case "shopping":
      return "shopping";
    default:
      return "unknown";
  }
}

function ktoTier(
  candidate: DetailedEligibleCandidate,
): CanonicalRecommendationCandidateV2["eligibilityTier"] {
  if (candidate.eligibility.tier && candidate.eligibility.tier !== "explicitly_ineligible") {
    return candidate.eligibility.tier;
  }
  if (candidate.assessment.verdict === "allowed") return "verified";
  if (candidate.assessment.verdict === "conditional") return "conditional";
  return "unverified";
}

function fromKto(
  candidate: DetailedEligibleCandidate,
  regionId: RegionId,
  selectionOrigin: CanonicalRecommendationCandidateV2["selectionOrigin"],
  petProfile: AutomaticRoutePetProfile,
): CanonicalRecommendationCandidateV2 {
  const tier = ktoTier(candidate);
  const verdict = candidate.assessment.verdict;
  const scopes = new Set(candidate.assessment.permittedScopes ?? []);
  const environment = scopes.has("indoor") && scopes.has("outdoor")
    ? "mixed"
    : scopes.has("indoor")
      ? "indoor"
      : scopes.has("outdoor")
        ? "outdoor"
        : (candidate.assessment.conditions ?? []).some(({ type }) =>
            type === "outdoor_only" || type === "indoor_restricted")
          ? "outdoor"
          : "unknown";
  const conditionEligibility = evaluateCanonicalPetConditions({
      assessment: candidate.assessment,
      petProfile,
      sizeCompatibility: candidate.sizeCompatibility?.state ?? "unknown",
      speciesCompatibility: candidate.eligibility.reasonCodes.includes("pet_type_incompatible")
        ? "incompatible"
        : candidate.eligibility.reasonCodes.includes("pet_type_verification_required")
          ? "verification_required"
          : "compatible",
    });
  return {
    canonicalId: `tour:${candidate.contentId}`,
    providerIdentities: [{ provider: "kto", id: candidate.contentId }],
    source: "tourism_service2",
    sourceLabel: "한국관광공사",
    regionId,
    districtCode: candidate.region.districtCode,
    title: candidate.title,
    address: candidate.summary.address,
    phone: candidate.summary.phone?.trim() || null,
    coordinates: candidate.coordinates,
    category: candidate.category,
    environment,
    petVerdict: verdict,
    catalogPetVerdict: verdict,
    petConditions: null,
    verificationRequired: false,
    evidenceStatus: tier === "verified" ? "verified" : tier,
    eligibilityTier: tier,
    scheduleStatus:
      candidate.scheduleCompatibility.status === "compatible" ? "known" : "unknown",
    operatingHoursEvidenceState:
      candidate.scheduleCompatibility.status === "compatible" ? "verified" : "verification_required",
    selectionOrigin,
    retrievedAt: candidate.summary.source.retrievedAt,
    imageUrl: candidate.summary.thumbnailUrl ?? candidate.summary.imageUrl,
    placeUrl: null,
    dataCompleteness: Math.max(0, Math.min(1, candidate.utility.dataQuality)),
    ktoCandidate: candidate,
    conditionEligibility,
  };
}

function fromKakao(
  candidate: MapPlacesSnapshotMarker,
  category: UsefulTourCategory,
  selectionOrigin: CanonicalRecommendationCandidateV2["selectionOrigin"],
): CanonicalRecommendationCandidateV2 {
  return {
    canonicalId: candidate.id,
    planningPolicy: "full_public_catalog_v1",
    catalogCategory: candidate.category,
    catalogEvidence: [{ provider: candidate.layer === "tourism" ? "kto" : "kakao", providerPlaceId: candidate.providerPlaceId, petAssessment: candidate.petAccessVerdict, originalText: candidate.petConditions?.slice(0, 2000) ?? null, retrievedAt: candidate.lastSeenAt ?? null, publicLabel: candidate.publicLabel.slice(0, 200) }],
    providerIdentities: [{ provider: candidate.layer === "tourism" ? "kto" : "kakao", id: candidate.providerPlaceId }],
    source: candidate.layer === "tourism" ? "tourism_service2" : "kakao_catalog",
    sourceLabel: candidate.sourceLabel,
    regionId: candidate.regionId,
    districtCode: candidate.districtCode,
    title: candidate.name,
    address: candidate.address || null,
    phone: candidate.phone ?? null,
    coordinates: candidate.coordinates!,
    category,
    environment: "unknown",
    petVerdict: candidate.petAccessVerdict,
    catalogPetVerdict: candidate.petAccessVerdict,
    petConditions: candidate.petConditions?.trim() || null,
    verificationRequired: candidate.verificationRequired ?? Boolean(candidate.petConditions?.trim()),
    evidenceStatus: "unverified",
    eligibilityTier: "unverified",
    scheduleStatus: "unknown",
    operatingHoursEvidenceState: "verification_required",
    selectionOrigin,
    retrievedAt: candidate.lastSeenAt ?? null,
    imageUrl: candidate.imageUrl ?? null,
    placeUrl: candidate.placeUrl ?? null,
    dataCompleteness: candidate.completeness ?? 0.5,
    ktoCandidate: null,
    conditionEligibility: eligiblePetConditionEligibility(),
  };
}

function applyRegisteredPlacePolicy(
  candidate: CanonicalRecommendationCandidateV2,
): CanonicalRecommendationCandidateV2 {
  return {
    ...candidate,
    catalogEvidence: candidate.catalogEvidence?.map((evidence) => ({
      ...evidence,
      publicLabel: "반려동물 동반 가능",
    })),
    petVerdict: "allowed",
    verificationRequired: false,
    evidenceStatus: "verified",
    eligibilityTier: "verified",
    conditionEligibility: eligiblePetConditionEligibility(),
  };
}

function safelyMatchesPhysicalPlace(
  left: CanonicalRecommendationCandidateV2,
  right: CanonicalRecommendationCandidateV2,
): boolean {
  if (normalizeIdentityText(left.title) !== normalizeIdentityText(right.title)) {
    return false;
  }
  if (!safeAddressMatch(left.address, right.address ?? "")) return false;
  return haversineKm(left.coordinates, right.coordinates) <= 0.075;
}

function mergeCandidates(
  authoritative: CanonicalRecommendationCandidateV2,
  discovered: CanonicalRecommendationCandidateV2,
): CanonicalRecommendationCandidateV2 {
  return {
    ...authoritative,
    catalogEvidence: [...(authoritative.catalogEvidence ?? []), ...(discovered.catalogEvidence ?? [])],
    petVerdict: [authoritative.petVerdict, discovered.petVerdict].includes("not_allowed") ? "not_allowed" : authoritative.petVerdict,
    catalogPetVerdict: [authoritative.catalogPetVerdict, discovered.catalogPetVerdict].includes("not_allowed") ? "not_allowed" : authoritative.catalogPetVerdict,
    selectionOrigin: authoritative.selectionOrigin === "user_selected" || discovered.selectionOrigin === "user_selected" ? "user_selected" : authoritative.selectionOrigin,
    providerIdentities: [
      ...authoritative.providerIdentities,
      ...discovered.providerIdentities.filter(
        (incoming) =>
          !authoritative.providerIdentities.some(
            (existing) =>
              existing.provider === incoming.provider && existing.id === incoming.id,
          ),
      ),
    ],
    address: authoritative.address ?? discovered.address,
    phone: authoritative.phone ?? discovered.phone,
    imageUrl: authoritative.imageUrl ?? discovered.imageUrl,
    placeUrl: authoritative.placeUrl ?? discovered.placeUrl,
    retrievedAt: authoritative.retrievedAt,
    dataCompleteness: Math.max(
      authoritative.dataCompleteness,
      discovered.dataCompleteness,
    ),
  };
}

export function fuseRecommendationCandidatesV2(input: {
  regionId: RegionId;
  districtId?: string | null;
  selectedCategories: readonly UsefulTourCategory[];
  ktoCandidates: readonly DetailedEligibleCandidate[];
  catalogCandidates: readonly MapPlacesSnapshotMarker[];
  explicitlyExcludedPlaceIds: readonly string[];
  selectedPlaceIds?: readonly string[];
  includeVerificationRequired?: boolean;
  completionFirst?: boolean;
  resolveConditions?: (placeId: string, analysis: CanonicalPetConditionEligibility) => CanonicalPetConditionEligibility;
  acknowledgedVerificationRequiredPlaceIds?: readonly string[];
  petProfile: AutomaticRoutePetProfile;
  selectionOrigin?: "automatic_fill" | "automatic_recommendation";
}): {
  candidates: CanonicalRecommendationCandidateV2[];
  diagnostics: CandidateFusionV2Diagnostics;
} {
  const excluded = new Set(input.explicitlyExcludedPlaceIds);
  const selected = new Set(input.selectedPlaceIds ?? []);
  const region = getRegionConfig(input.regionId);
  const details = new Map(input.ktoCandidates.map(value => [value.contentId, value]));
  const excludedByReason: Record<string, number> = {};
  const identities: NonNullable<CandidateFusionV2Diagnostics["identities"]> = [];
  const canonical: CanonicalRecommendationCandidateV2[] = [];
  const titleBuckets = new Map<string, number[]>();
  const rawIds = new Set<string>();
  const reject = (rawId: string, reason: string) => {
    increment(excludedByReason, reason);
    identities.push({ rawId, canonicalId: null, outcome: "excluded", reason });
  };
  // Only published catalog identities can introduce a place. Detail is optional enrichment.
  for (const value of [...input.catalogCandidates].sort((a, b) => Number(b.layer === "tourism") - Number(a.layer === "tourism") || a.id.localeCompare(b.id))) {
    if (rawIds.has(value.id)) { reject(value.id, "duplicate_public_identity"); continue; }
    rawIds.add(value.id);
    if (value.id !== (value.layer === "tourism" ? "tour:" : "kakao:") + value.providerPlaceId) { reject(value.id, "invalid_provider_identity"); continue; }
    if (!value.coordinates || !Number.isFinite(value.coordinates.latitude) || !Number.isFinite(value.coordinates.longitude)) { reject(value.id, "missing_or_invalid_coordinates"); continue; }
    if (value.regionId !== input.regionId || !coordinatesInRegion(region, value.coordinates)) { reject(value.id, "cross_region"); continue; }
    if ((value.layer === "veterinary" || value.layer === "pet_shop") && !selected.has(value.id)) {
      reject(value.id, "automatic_itinerary_category_excluded");
      continue;
    }
    const origin = selected.has(value.id) ? "user_selected" : input.selectionOrigin ?? "automatic_recommendation";
    const category = value.layer === "tourism" && value.contentTypeId === "14" ? "culture"
      : value.layer === "tourism" && value.contentTypeId === "15" ? "festival"
      : usefulCategory(value.category) ?? "unknown";
    let candidate = fromKakao(value, category, origin);
    const detail = value.layer === "tourism" ? details.get(value.providerPlaceId) : undefined;
    if (detail) {
      const enriched = fromKto(detail, input.regionId, origin, input.petProfile);
      candidate = { ...enriched, planningPolicy: "full_public_catalog_v1", coordinates: value.coordinates,
        catalogEvidence: candidate.catalogEvidence, catalogPetVerdict: value.petAccessVerdict,
        petConditions: value.petConditions ?? null, placeUrl: value.placeUrl ?? null,
        petVerdict: value.petAccessVerdict === "not_allowed" ? "not_allowed" : enriched.petVerdict };
    }
    candidate = applyRegisteredPlacePolicy(candidate);
    // ponytail: title buckets keep this bounded at city-catalog sizes; spatial index if catalogs reach 100k.
    const titleKey = normalizeIdentityText(candidate.title);
    const bucket = titleBuckets.get(titleKey) ?? [];
    const match = bucket.find(index => safelyMatchesPhysicalPlace(canonical[index]!, candidate)) ?? -1;
    if (match >= 0) {
      const previous = canonical[match]!;
      canonical[match] = mergeCandidates(previous, candidate);
      identities.push({ rawId: value.id, canonicalId: previous.canonicalId, outcome: "alias" });
    } else {
      canonical.push(candidate);
      titleBuckets.set(titleKey, [...bucket, canonical.length - 1]);
      identities.push({ rawId: value.id, canonicalId: candidate.canonicalId, outcome: "canonical" });
    }
  }
  const candidates = canonical.filter(candidate => {
    if (!candidate.providerIdentities.some(({ provider, id }) => excluded.has(id) || excluded.has((provider === "kto" ? "tour:" : "kakao:") + id))) return true;
    for (const identity of identities.filter(item => item.canonicalId === candidate.canonicalId)) {
      identity.outcome = "excluded"; identity.reason = "explicit_user_exclusion";
      increment(excludedByReason, "explicit_user_exclusion");
    }
    return false;
  }).sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
  const sourceCounts = { kto: input.catalogCandidates.filter(item => item.layer === "tourism").length, kakao: input.catalogCandidates.filter(item => item.layer !== "tourism").length };
  const count = candidates.length;
  return { candidates, diagnostics: {
    version: CANDIDATE_FUSION_V2_VERSION, identities, sourceCounts,
    acceptedSourceCounts: { kto: candidates.filter(item => item.providerIdentities.every(identity => identity.provider === "kto")).length, kakao: candidates.filter(item => item.providerIdentities.every(identity => identity.provider === "kakao")).length },
    crossProviderDuplicatesMerged: candidates.filter(item => new Set(item.providerIdentities.map(identity => identity.provider)).size > 1).length,
    excludedByReason,
    stageCounts: { providerRawCandidates: input.catalogCandidates.length, regionFilteredCandidates: canonical.length, districtFilteredCandidates: canonical.length, requestedCategoryCandidates: canonical.length, petEligibleCandidates: count, operatingHoursEligibleCandidates: count },
    finalCount: count,
  } };
}
