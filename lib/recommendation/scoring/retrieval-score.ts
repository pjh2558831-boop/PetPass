import "server-only";

import { RETRIEVAL_SCORE_V1_CONFIG } from "@/lib/recommendation/config/retrieval-score-v1";

export interface RetrievalScoreV1Input {
  preferenceFit: number;
  proximity: number;
  categoryCoverageNeed: number;
  listDataQuality: number;
  popularityPrior: number;
}

export interface RetrievalScoreV1Result extends RetrievalScoreV1Input {
  version: "retrieval-score-v1";
  total: number;
  weightedContributions: RetrievalScoreV1Input;
}

function normalized(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be normalized to [0, 1]`);
  }
  return value;
}

export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

export function scoreRetrievalCandidateV1(
  input: RetrievalScoreV1Input,
): RetrievalScoreV1Result {
  const components: RetrievalScoreV1Input = {
    preferenceFit: normalized(input.preferenceFit, "preferenceFit"),
    proximity: normalized(input.proximity, "proximity"),
    categoryCoverageNeed: normalized(
      input.categoryCoverageNeed,
      "categoryCoverageNeed",
    ),
    listDataQuality: normalized(input.listDataQuality, "listDataQuality"),
    popularityPrior: normalized(input.popularityPrior, "popularityPrior"),
  };
  const weightedContributions = {
    preferenceFit:
      components.preferenceFit * RETRIEVAL_SCORE_V1_CONFIG.weights.preferenceFit,
    proximity: components.proximity * RETRIEVAL_SCORE_V1_CONFIG.weights.proximity,
    categoryCoverageNeed:
      components.categoryCoverageNeed *
      RETRIEVAL_SCORE_V1_CONFIG.weights.categoryCoverageNeed,
    listDataQuality:
      components.listDataQuality *
      RETRIEVAL_SCORE_V1_CONFIG.weights.listDataQuality,
    popularityPrior:
      components.popularityPrior *
      RETRIEVAL_SCORE_V1_CONFIG.weights.popularityPrior,
  };
  const normalizedTotal = Object.values(weightedContributions).reduce(
    (sum, value) => sum + value,
    0,
  );
  return {
    version: RETRIEVAL_SCORE_V1_CONFIG.version,
    total: roundHalfUp(normalizedTotal * RETRIEVAL_SCORE_V1_CONFIG.scale),
    ...components,
    weightedContributions,
  };
}
