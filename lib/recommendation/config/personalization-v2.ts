import "server-only";

export const PERSONALIZATION_V2_CONFIG = {
  version: "personalization-v2",
  scale: 1_000,
  candidateWeights: {
    petProfileCompatibility: 0.18,
    categoryPreference: 0.15,
    tripMood: 0.09,
    crowdPreference: 0.05,
    travelEfficiency: 0.13,
    originAccessibility: 0.1,
    scheduleFit: 0.08,
    environmentPreference: 0.07,
    walkingTolerance: 0.06,
    informationTrust: 0.06,
    novelty: 0.03,
  },
  eligibilityTier: {
    verified: 1,
    conditional: 0.82,
    unverified: 0.55,
  },
  routeDiversity: {
    candidateOverlapPenalty: 180,
    orderOverlapPenalty: 90,
    recentSignaturePenalty: 500,
    repeatedPlacePenalty: 120,
    categoryCoverageBonus: 90,
  },
} as const;
