import "server-only";

export const ROUTE_SOLVER_V1_CONFIG = {
  version: "route-solver-v1",
  engineVersion: "petpass-route-engine-v1",
  maxCandidates: 15,
  maxSelectedStops: 5,
  solverDeadlineMs: 1_000,
  maxExpandedStates: 1_000_000,
  beamWidth: 256,
  maxInternalFinalists: 10,
  maxFinalValidationAttempts: 3,
  maxReturnedAlternatives: 2,
  maxExcludedHighlights: 5,
  maxUnknownScheduleStops: 1,
  pace: {
    relaxed: { targetStops: 2, minStops: 1, maxStops: 3, maxDurationMinutes: 360 },
    balanced: { targetStops: 3, minStops: 2, maxStops: 4, maxDurationMinutes: 480 },
    packed: { targetStops: 5, minStops: 3, maxStops: 5, maxDurationMinutes: 600 },
  },
} as const;

