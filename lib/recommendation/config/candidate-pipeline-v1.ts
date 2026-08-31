import "server-only";

export const CANDIDATE_PIPELINE_V1_CONFIG = {
  version: "candidate-pipeline-v1",
  /** Bounded list shortlist after category + district diversity is available. */
  stageALimit: 45,
  /** Bounded schedule shortlist after schedule + geographic diversity is available. */
  stageBLimit: 30,
  detailBatchSize: 5,
  maxDetailedEvaluations: 30,
  /** Service-level personalization applies the solver's final 15-place cap. */
  finalEligibleLimit: 30,
  eligibleReserveAboveMaxStops: 3,
  maximumEligiblePoolTarget: 30,
  detailConcurrency: 3,
  /** Mirrors the server-owned Service2 list/visibility cache contract. */
  visibilityFreshnessMs: 5 * 60 * 1_000,
  /** Mirrors the server-owned Service2 detail cache contract. */
  detailFreshnessMs: 15 * 60 * 1_000,
  /** Unknown schedule information receives a moderate deterministic penalty. */
  stageBUnknownPenalty: 50,
  /** Balanced retrieval scale; other paces scale by maxStops / 4. */
  balancedProximityScaleKm: 10,
  balancedMaxStops: 4,
} as const;

export type CandidatePipelineV1Config = typeof CANDIDATE_PIPELINE_V1_CONFIG;
