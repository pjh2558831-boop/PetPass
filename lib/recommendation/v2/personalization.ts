import "server-only";

import { PERSONALIZATION_V2_CONFIG } from "@/lib/recommendation/config/personalization-v2";
import type { UsefulTourCategory } from "@/lib/recommendation/types";

export type RouteStyleV2 = "comfort" | "preference" | "efficient";
export type EnvironmentPreferenceV2 =
  | "any"
  | "indoor_preferred"
  | "outdoor_preferred";

export interface PersonalizationCandidateV2 {
  canonicalId: string;
  category: UsefulTourCategory;
  eligibilityTier: "verified" | "conditional" | "unverified";
  environment: "indoor" | "outdoor" | "mixed" | "unknown";
  scheduleStatus: "known" | "unknown";
  distanceKm: number;
  informationTrust: number;
  dataCompleteness: number;
  highActivity: boolean;
  popularitySignal: number | null;
}

export interface PersonalizationContextV2 {
  environmentPreference: EnvironmentPreferenceV2;
  petCount: number;
  petActivityLevel: "low" | "moderate" | "high";
  walkingTolerance: "low" | "moderate" | "high";
  crowdPreference: "avoid" | "any" | "enjoy";
  tripMood: "balanced" | "scenic" | "foodie" | "active" | "restful";
  categoryPriorities: Partial<Record<UsefulTourCategory, number>>;
  recentlySelectedCandidateIds: readonly string[];
  rerollVariant: number;
}

export interface PersonalizationScoreV2 {
  version: typeof PERSONALIZATION_V2_CONFIG.version;
  total: number;
  components: {
    petProfileCompatibility: number;
    categoryPreference: number;
    tripMood: number;
    crowdPreference: number;
    travelEfficiency: number;
    originAccessibility: number;
    scheduleFit: number;
    environmentPreference: number;
    walkingTolerance: number;
    informationTrust: number;
    novelty: number;
  };
  styleUtilities: Record<RouteStyleV2, number>;
  explanationCodes: string[];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function activityFit(
  candidate: PersonalizationCandidateV2,
  context: PersonalizationContextV2,
): number {
  if (!candidate.highActivity) {
    return context.petActivityLevel === "low" ? 1 : 0.8;
  }
  return context.petActivityLevel === "high"
    ? 1
    : context.petActivityLevel === "moderate"
      ? 0.7
      : 0.35;
}

function petProfileFit(
  candidate: PersonalizationCandidateV2,
  context: PersonalizationContextV2,
): number {
  const tierFit = PERSONALIZATION_V2_CONFIG.eligibilityTier[candidate.eligibilityTier];
  const multiPetEvidenceFactor = context.petCount <= 1 || candidate.eligibilityTier === "verified"
    ? 1
    : candidate.eligibilityTier === "conditional"
      ? 0.9
      : 0.75;
  return tierFit * activityFit(candidate, context) * multiPetEvidenceFactor;
}

function crowdFit(
  candidate: PersonalizationCandidateV2,
  context: PersonalizationContextV2,
): number {
  if (context.crowdPreference === "any") return 0.7;
  if (candidate.popularitySignal === null) return 0.6;
  const popularity = clamp(candidate.popularitySignal);
  return context.crowdPreference === "enjoy" ? popularity : 1 - popularity;
}

function walkingFit(
  candidate: PersonalizationCandidateV2,
  context: PersonalizationContextV2,
): number {
  if (!candidate.highActivity) return 0.9;
  return context.walkingTolerance === "high"
    ? 1
    : context.walkingTolerance === "moderate"
      ? 0.65
      : 0.25;
}

function moodFit(
  candidate: PersonalizationCandidateV2,
  context: PersonalizationContextV2,
): number {
  switch (context.tripMood) {
    case "scenic":
      return ["attraction", "leisure"].includes(candidate.category) ? 1 : 0.45;
    case "foodie":
      return candidate.category === "food" ? 1 : 0.4;
    case "active":
      return candidate.highActivity ? 1 : 0.45;
    case "restful":
      return candidate.highActivity ? 0.3 : 0.95;
    default:
      return 0.7;
  }
}

function environmentFit(
  candidate: PersonalizationCandidateV2,
  context: PersonalizationContextV2,
): number {
  if (context.environmentPreference === "any") return 0.7;
  if (candidate.environment === "unknown") return 0.55;
  if (candidate.environment === "mixed") return 0.8;
  const preferred = context.environmentPreference === "indoor_preferred"
    ? "indoor"
    : "outdoor";
  return candidate.environment === preferred ? 1 : 0.35;
}

function weightedTotal(
  components: PersonalizationScoreV2["components"],
): number {
  return Math.round(
    Object.entries(PERSONALIZATION_V2_CONFIG.candidateWeights).reduce(
      (sum, [key, weight]) =>
        sum + components[key as keyof typeof components] * weight,
      0,
    ) * PERSONALIZATION_V2_CONFIG.scale,
  );
}

export function scoreCandidatePersonalizationV2(
  candidate: PersonalizationCandidateV2,
  context: PersonalizationContextV2,
): PersonalizationScoreV2 {
  const repeated = context.recentlySelectedCandidateIds.includes(candidate.canonicalId);
  const components: PersonalizationScoreV2["components"] = {
    petProfileCompatibility: petProfileFit(candidate, context),
    categoryPreference: clamp(context.categoryPriorities[candidate.category] ?? 0.6),
    tripMood: moodFit(candidate, context),
    crowdPreference: crowdFit(candidate, context),
    travelEfficiency: 1 / (1 + Math.max(0, candidate.distanceKm) / 8),
    originAccessibility: 1 / (1 + Math.max(0, candidate.distanceKm) / 15),
    scheduleFit: candidate.scheduleStatus === "known" ? 1 : 0.65,
    environmentPreference: environmentFit(candidate, context),
    walkingTolerance: walkingFit(candidate, context),
    informationTrust: clamp(
      candidate.informationTrust * 0.7 + candidate.dataCompleteness * 0.3,
    ),
    novelty: repeated ? 0 : 1,
  };
  const explanationCodes = [
    `eligibility_${candidate.eligibilityTier}`,
    `mood_${context.tripMood}`,
    `environment_${context.environmentPreference}`,
    candidate.scheduleStatus === "known" ? "schedule_known" : "schedule_unknown_nonblocking",
  ];
  if (candidate.eligibilityTier === "unverified") {
    explanationCodes.push("pet_evidence_unverified");
  }
  if (repeated) explanationCodes.push("recent_place_penalty");
  const comfort = Math.round(
    1_000 * (
      components.petProfileCompatibility * 0.3 +
      components.travelEfficiency * 0.2 +
      components.walkingTolerance * 0.17 +
      components.informationTrust * 0.15 +
      components.scheduleFit * 0.1 +
      components.environmentPreference * 0.08
    ),
  );
  const preference = Math.round(
    1_000 * (
      components.categoryPreference * 0.35 +
      components.tripMood * 0.2 +
      components.petProfileCompatibility * 0.15 +
      components.crowdPreference * 0.1 +
      components.environmentPreference * 0.1 +
      components.novelty * 0.05 +
      components.informationTrust * 0.05
    ),
  );
  const efficient = Math.round(
    1_000 * (
      components.travelEfficiency * 0.5 +
      components.originAccessibility * 0.25 +
      components.scheduleFit * 0.15 +
      components.informationTrust * 0.1
    ),
  );
  return {
    version: PERSONALIZATION_V2_CONFIG.version,
    total: weightedTotal(components),
    components,
    styleUtilities: { comfort, preference, efficient },
    explanationCodes: [...new Set(explanationCodes)].sort(),
  };
}
