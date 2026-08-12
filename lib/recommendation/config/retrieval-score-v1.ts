import "server-only";

export const RETRIEVAL_SCORE_V1_CONFIG = {
  version: "retrieval-score-v1",
  scale: 1_000,
  weights: {
    preferenceFit: 0.4,
    proximity: 0.25,
    categoryCoverageNeed: 0.2,
    listDataQuality: 0.1,
    popularityPrior: 0.05,
  },
} as const;
