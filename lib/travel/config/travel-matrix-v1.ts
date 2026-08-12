import "server-only";

export const TRAVEL_MATRIX_V1_CONFIG = {
  version: "travel-matrix-v1",
  providerContractVersion: "kakao-mobility-public-v1",
  maxCandidates: 15,
  maxNodes: 16,
  multiDestinationRadiusMeters: 10_000,
  maxDestinationsPerBatch: 30,
  maxBatchRequestsPerMatrix: 16,
  maxPairFallbackRequestsPerMatrix: 24,
  providerConcurrency: 3,
  providerRequestTimeoutMs: 8_000,
  matrixDeadlineMs: 10_000,
  priority: "TIME",
  coordinatePrecisionDigits: 4,
  roadDistanceTtlMs: 7 * 24 * 60 * 60 * 1_000,
  currentTrafficDurationTtlMs: 15 * 60 * 1_000,
  futureDurationTtlMs: 15 * 60 * 1_000,
  negativeCacheTtlMs: 2 * 60 * 1_000,
  futureWaypointLimit: 5,
  finalStopLimit: 5,
} as const;

if (TRAVEL_MATRIX_V1_CONFIG.multiDestinationRadiusMeters > 10_000) {
  throw new Error("TRAVEL_MATRIX_RADIUS_EXCEEDS_PUBLIC_KAKAO_CONTRACT");
}
if (TRAVEL_MATRIX_V1_CONFIG.maxDestinationsPerBatch > 30) {
  throw new Error("TRAVEL_MATRIX_BATCH_EXCEEDS_PUBLIC_KAKAO_CONTRACT");
}

