import "server-only";

export const PLACE_UTILITY_V1_CONFIG = {
  version: "place-utility-v1",
  scale: 1_000,
  weights: {
    preferenceFit: 0.3,
    petCompatibility: 0.25,
    informationTrust: 0.15,
    popularity: 0.12,
    categoryPriority: 0.1,
    dataQuality: 0.08,
  },
  petCompatibility: {
    allowed: 1,
    compatibleConditional: 0.85,
    unverified: 0.55,
  },
} as const;
