import "server-only";

import { haversineKm } from "@/lib/itinerary/optimizer";
import { resolveDwellDurationV1 } from "@/lib/recommendation/config/dwell-duration-v1";
import {
  isHighActivity,
  normalizeSchedule,
  visitRole,
} from "@/lib/recommendation/optimizer/candidate-adapter";
import type { PlaceUtilityBreakdown } from "@/lib/recommendation/scoring/place-utility";
import type {
  NormalizedVisitSchedule,
  RouteOptimizationCandidate,
  RouteVisitRole,
} from "@/lib/recommendation/types/route-optimizer";
import type { CanonicalRecommendationCandidateV2 } from "@/lib/recommendation/v2/candidate-fusion";
import {
  scoreCandidatePersonalizationV2,
  type PersonalizationContextV2,
} from "@/lib/recommendation/v2/personalization";
import type { TourContentTypeId } from "@/types/place";
import type { PlaceTrustResult } from "@/types/place-source";

function contentType(candidate: CanonicalRecommendationCandidateV2): TourContentTypeId | "cafe_rest" {
  if (candidate.ktoCandidate) return candidate.ktoCandidate.contentTypeId;
  switch (candidate.category) {
    case "food": return "39";
    case "accommodation": return "32";
    case "leisure": return "28";
    case "shopping": return "38";
    default: return "12";
  }
}

function role(candidate: CanonicalRecommendationCandidateV2): RouteVisitRole {
  if (candidate.ktoCandidate) return visitRole(candidate.ktoCandidate);
  switch (candidate.category) {
    case "food": return "meal";
    case "accommodation": return "accommodation";
    case "shopping": return "shopping";
    case "attraction":
    case "leisure": return "activity";
    default: return "other";
  }
}

function highActivity(candidate: CanonicalRecommendationCandidateV2): boolean {
  return candidate.ktoCandidate
    ? isHighActivity(candidate.ktoCandidate)
    : candidate.category === "leisure";
}

function schedule(candidate: CanonicalRecommendationCandidateV2): NormalizedVisitSchedule {
  if (candidate.ktoCandidate) return normalizeSchedule(candidate.ktoCandidate);
  return {
    status: "unknown",
    windows: [],
    mandatoryReservationImpossible: false,
    source: "stage2_unknown",
    warningCodes: ["operating_hours_unverified"],
  };
}

function trust(candidate: CanonicalRecommendationCandidateV2, computedAt: string): PlaceTrustResult {
  if (candidate.ktoCandidate) return candidate.ktoCandidate.trust;
  const score = Math.round(25 + candidate.dataCompleteness * 30);
  return {
    ruleVersion: "petpass-trust-v1",
    score,
    level: score >= 70 ? "high" : score >= 40 ? "medium" : "low",
    evidenceCount: 1,
    computedAt,
    components: [{
      code: "kakao_discovery_baseline",
      label: "카카오 저장 후보",
      points: score,
      kind: "context",
      ...(candidate.retrievedAt ? { observedAt: candidate.retrievedAt } : {}),
    }],
    flags: ["verification_required", "missing_evidence"],
  };
}

function utility(
  candidate: CanonicalRecommendationCandidateV2,
  personalization: ReturnType<typeof scoreCandidatePersonalizationV2>,
): PlaceUtilityBreakdown {
  const components = personalization.components;
  return {
    version: "place-utility-v1",
    total: personalization.total,
    preferenceFit: components.categoryPreference,
    petCompatibility: components.petProfileCompatibility,
    informationTrust: components.informationTrust,
    popularity: candidate.ktoCandidate?.popularity.score ?? 0.5,
    categoryPriority: components.categoryPreference,
    dataQuality: candidate.dataCompleteness,
    weightedContributions: {
      preferenceFit: Math.round(components.categoryPreference * 170),
      petCompatibility: Math.round(components.petProfileCompatibility * 180),
      informationTrust: Math.round(components.informationTrust * 60),
      popularity: 0,
      categoryPriority: Math.round(components.tripMood * 110),
      dataQuality: Math.round(candidate.dataCompleteness * 60),
    },
    reasonCodes: personalization.explanationCodes,
    warningCodes: candidate.evidenceStatus === "unverified"
      ? ["pet_evidence_unverified"]
      : [],
  };
}

export function adaptCanonicalCandidateForRouteV2(input: {
  candidate: CanonicalRecommendationCandidateV2;
  departure: { latitude: number; longitude: number };
  personalization: PersonalizationContextV2;
  computedAt: string;
}): RouteOptimizationCandidate {
  const candidateHighActivity = highActivity(input.candidate);
  const personalization = scoreCandidatePersonalizationV2(
    {
      canonicalId: input.candidate.canonicalId,
      category: input.candidate.category,
      eligibilityTier: input.candidate.eligibilityTier,
      environment: input.candidate.environment,
      scheduleStatus: input.candidate.scheduleStatus,
      distanceKm: haversineKm(input.departure, input.candidate.coordinates),
      informationTrust: (input.candidate.ktoCandidate?.trust.score ?? 45) / 100,
      dataCompleteness: input.candidate.dataCompleteness,
      highActivity: candidateHighActivity,
      popularitySignal:
        input.candidate.ktoCandidate?.popularity.status === "sufficient_data"
          ? input.candidate.ktoCandidate.popularity.score
          : null,
    },
    input.personalization,
  );
  const dwell = resolveDwellDurationV1({ category: contentType(input.candidate) });
  return {
    place: input.candidate.ktoCandidate,
    node: {
      id: input.candidate.canonicalId,
      kind: "place",
      name: input.candidate.title,
      latitude: input.candidate.coordinates.latitude,
      longitude: input.candidate.coordinates.longitude,
    },
    placeUtility: utility(input.candidate, personalization),
    dwellDurationMinutes: dwell.minutes,
    dwellDurationSource: "category_default",
    schedule: schedule(input.candidate),
    category: input.candidate.category,
    visitRole: role(input.candidate),
    highActivity: candidateHighActivity,
    popularity: input.candidate.ktoCandidate?.popularity ?? {
      score: 0.5,
      status: "insufficient_data",
      qualityComponent: 0,
      trendComponent: 0,
      sampleWeight: 0,
      version: "popularity-v1",
    },
    informationTrust: trust(input.candidate, input.computedAt),
    exposure: { version: "exposure-v1", status: "not_available", score: null },
    source: input.candidate.source,
    petAssessment: input.candidate.petVerdict,
    evidenceStatus: input.candidate.evidenceStatus,
    eligibilityTier: input.candidate.eligibilityTier,
    personalization,
  };
}
