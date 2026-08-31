import "server-only";

import { haversineKm } from "@/lib/itinerary/optimizer";
import { coordinatesInRegion, getRegionConfig, getRegionDistrict } from "@/lib/regions/config";
import type {
  DetailedEligibleCandidate,
  UsefulTourCategory,
} from "@/lib/recommendation/types";
import type { MapPlacesSnapshotMarker } from "@/types/map-places-snapshot";
import type { RegionId } from "@/types/region";
import type { RouteEligibilityTier } from "@/types/route-eligibility";

export const CANDIDATE_FUSION_V2_VERSION = "candidate-fusion-v2" as const;

export interface CanonicalProviderIdentityV2 {
  provider: "kto" | "kakao";
  id: string;
}

export interface CanonicalRecommendationCandidateV2 {
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
  petVerdict: "allowed" | "conditional" | "unknown";
  catalogPetVerdict: "allowed" | "conditional" | "not_allowed" | "unknown";
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
}

export interface CandidateFusionV2Diagnostics {
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
      return null;
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
): CanonicalRecommendationCandidateV2 {
  const tier = ktoTier(candidate);
  const verdict = candidate.assessment.verdict === "allowed"
    ? "allowed"
    : candidate.assessment.verdict === "conditional"
      ? "conditional"
      : "unknown";
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
  };
}

function fromKakao(
  candidate: MapPlacesSnapshotMarker,
  category: UsefulTourCategory,
  selectionOrigin: CanonicalRecommendationCandidateV2["selectionOrigin"],
): CanonicalRecommendationCandidateV2 {
  return {
    canonicalId: candidate.id,
    providerIdentities: [{ provider: "kakao", id: candidate.providerPlaceId }],
    source: "kakao_catalog",
    sourceLabel: "카카오 검색 후보",
    regionId: candidate.regionId,
    districtCode: candidate.districtCode,
    title: candidate.name,
    address: candidate.address || null,
    phone: null,
    coordinates: candidate.coordinates!,
    category,
    environment: "unknown",
    petVerdict: "unknown",
    catalogPetVerdict: candidate.petAccessVerdict,
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
    retrievedAt:
      [authoritative.retrievedAt, discovered.retrievedAt]
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null,
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
  selectionOrigin?: "automatic_fill" | "automatic_recommendation";
}): {
  candidates: CanonicalRecommendationCandidateV2[];
  diagnostics: CandidateFusionV2Diagnostics;
} {
  const excluded = new Set(input.explicitlyExcludedPlaceIds);
  const selectedPlaceIds = new Set(input.selectedPlaceIds ?? []);
  const selected = new Set(input.selectedCategories);
  const region = getRegionConfig(input.regionId);
  const requestedDistrict = input.districtId
    ? getRegionDistrict(region, input.districtId)
    : null;
  const acceptedDistrictCodes = new Set([
    ...(requestedDistrict ? [requestedDistrict.legalDongDistrictCode] : []),
    ...(requestedDistrict?.collectionLegalDongDistrictCodes ?? []),
    ...(requestedDistrict?.collectionAreaDistrictCodes ?? []),
  ]);
  const defaultOrigin = input.selectionOrigin ?? "automatic_recommendation";
  const excludedByReason: Record<string, number> = {};
  const stageCounts = {
    providerRawCandidates: input.ktoCandidates.length +
      input.catalogCandidates.filter(({ layer }) => layer === "kakao").length,
    regionFilteredCandidates: 0,
    districtFilteredCandidates: 0,
    requestedCategoryCandidates: 0,
    petEligibleCandidates: 0,
    operatingHoursEligibleCandidates: 0,
  };
  let ktoAccepted = 0;
  let kakaoAccepted = 0;
  let crossProviderDuplicatesMerged = 0;
  const candidates: CanonicalRecommendationCandidateV2[] = [];

  const inRequestedDistrict = (districtCode: string | null) =>
    !input.districtId || Boolean(districtCode && acceptedDistrictCodes.has(districtCode));
  const hasPresentableConditionalEvidence = (candidate: CanonicalRecommendationCandidateV2) =>
    candidate.petVerdict === "conditional" &&
    candidate.evidenceStatus === "conditional" &&
    candidate.ktoCandidate?.eligibility.eligible === true &&
    (candidate.ktoCandidate.assessment.conditions ?? []).length > 0 &&
    (candidate.ktoCandidate.assessment.conditions ?? []).every(({ label }) => label.trim().length > 0) &&
    candidate.ktoCandidate.sizeCompatibility?.state !== "incompatible";
  const passesPetGate = (candidate: CanonicalRecommendationCandidateV2, userSelected: boolean) => {
    if (userSelected || input.includeVerificationRequired) return candidate.catalogPetVerdict !== "not_allowed";
    return (
      candidate.petVerdict === "allowed" && candidate.evidenceStatus === "verified"
    ) || hasPresentableConditionalEvidence(candidate);
  };
  const passesHoursGate = (candidate: CanonicalRecommendationCandidateV2, userSelected: boolean) =>
    userSelected || input.includeVerificationRequired || candidate.scheduleStatus === "known";

  for (const value of input.ktoCandidates) {
    const canonicalId = `tour:${value.contentId}`;
    const userSelected = selectedPlaceIds.has(canonicalId);
    const candidate = fromKto(value, input.regionId, userSelected ? "user_selected" : defaultOrigin);
    if (
      value.region.regionCode !== region.providerCodes.korPetTourService2.legalDongRegionCode ||
      !coordinatesInRegion(region, value.coordinates)
    ) {
      increment(excludedByReason, "cross_region");
      continue;
    }
    stageCounts.regionFilteredCandidates += 1;
    if (!inRequestedDistrict(value.region.districtCode)) {
      increment(excludedByReason, "district_mismatch");
      continue;
    }
    stageCounts.districtFilteredCandidates += 1;
    if (!selected.has(candidate.category) && !userSelected) {
      increment(excludedByReason, "category_not_selected");
      continue;
    }
    stageCounts.requestedCategoryCandidates += 1;
    if (!passesPetGate(candidate, userSelected)) {
      increment(excludedByReason, candidate.petVerdict === "unknown" || candidate.evidenceStatus === "unverified"
        ? "pet_evidence_unverified"
        : "pet_policy_incompatible");
      continue;
    }
    stageCounts.petEligibleCandidates += 1;
    if (!passesHoursGate(candidate, userSelected)) {
      increment(excludedByReason, "operating_hours_unknown");
      continue;
    }
    stageCounts.operatingHoursEligibleCandidates += 1;
    if (excluded.has(candidate.canonicalId) || excluded.has(value.contentId)) {
      increment(excludedByReason, "explicit_user_exclusion");
      continue;
    }
    candidates.push(candidate);
    ktoAccepted += 1;
  }

  for (const value of input.catalogCandidates) {
    if (value.layer !== "kakao") continue;
    if (value.regionId !== input.regionId || !value.coordinates || !coordinatesInRegion(region, value.coordinates)) {
      increment(excludedByReason, "cross_region");
      continue;
    }
    stageCounts.regionFilteredCandidates += 1;
    if (!inRequestedDistrict(value.districtCode)) {
      increment(excludedByReason, "district_mismatch");
      continue;
    }
    stageCounts.districtFilteredCandidates += 1;
    const category = usefulCategory(value.category);
    const userSelected = selectedPlaceIds.has(value.id);
    if (!category || (!selected.has(category) && !userSelected)) {
      increment(excludedByReason, "category_not_selected");
      continue;
    }
    stageCounts.requestedCategoryCandidates += 1;
    if (value.petAccessVerdict === "not_allowed") {
      increment(excludedByReason, "explicit_not_allowed");
      continue;
    }
    if (excluded.has(value.id) || excluded.has(value.providerPlaceId)) {
      increment(excludedByReason, "explicit_user_exclusion");
      continue;
    }
    const candidate = fromKakao(value, category, userSelected ? "user_selected" : defaultOrigin);
    const duplicateIndex = candidates.findIndex(
      (existing) =>
        existing.source === "tourism_service2" &&
        safelyMatchesPhysicalPlace(existing, candidate),
    );
    if (duplicateIndex >= 0) {
      stageCounts.petEligibleCandidates += 1;
      stageCounts.operatingHoursEligibleCandidates += 1;
      candidates[duplicateIndex] = mergeCandidates(
        candidates[duplicateIndex]!,
        candidate,
      );
      crossProviderDuplicatesMerged += 1;
      continue;
    }
    if (!passesPetGate(candidate, userSelected)) {
      increment(excludedByReason, "pet_evidence_unverified");
      continue;
    }
    stageCounts.petEligibleCandidates += 1;
    if (!passesHoursGate(candidate, userSelected)) {
      increment(excludedByReason, "operating_hours_unknown");
      continue;
    }
    stageCounts.operatingHoursEligibleCandidates += 1;
    if (candidates.some(({ canonicalId }) => canonicalId === candidate.canonicalId)) {
      increment(excludedByReason, "duplicate_canonical_id");
      continue;
    }
    candidates.push(candidate);
    kakaoAccepted += 1;
  }

  candidates.sort((left, right) => left.canonicalId.localeCompare(right.canonicalId));
  return {
    candidates,
    diagnostics: {
      version: CANDIDATE_FUSION_V2_VERSION,
      sourceCounts: {
        kto: input.ktoCandidates.length,
        kakao: input.catalogCandidates.filter(({ layer }) => layer === "kakao").length,
      },
      acceptedSourceCounts: { kto: ktoAccepted, kakao: kakaoAccepted },
      crossProviderDuplicatesMerged,
      excludedByReason: Object.fromEntries(
        Object.entries(excludedByReason).sort(([left], [right]) => left.localeCompare(right)),
      ),
      stageCounts,
      finalCount: candidates.length,
    },
  };
}
