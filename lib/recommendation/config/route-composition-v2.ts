import "server-only";

/** Named policy for feasibility, category balance, and route-option diversity. */
export const ROUTE_COMPOSITION_V2_CONFIG = {
  version: "route-composition-v2",
  feasibility: {
    maxExpandedStates: 500_000,
    paceWaitLimits: {
      relaxed: { maximumSingleWaitMinutes: 60, maximumTotalWaitMinutes: 90 },
      balanced: { maximumSingleWaitMinutes: 45, maximumTotalWaitMinutes: 60 },
      packed: { maximumSingleWaitMinutes: 30, maximumTotalWaitMinutes: 45 },
    },
  },
  categoryBalance: {
    /** Soft penalties only; this is deliberately not a percentage cap. */
    secondVisitPenalty: 90,
    additionalVisitPenalty: 150,
    consecutiveVisitPenalty: 120,
  },
  routeOptions: {
    recentSignaturePenalty: 1_200,
    recentFirstAutomaticStopPenalty: 900,
    recentAutomaticPlacePenalty: 180,
    selectedOptionPlaceOverlapPenalty: 180,
    selectedOptionOrderOverlapPenalty: 90,
    categoryCoverageBonus: 90,
  },
} as const;

export function paceWaitLimitsV2(pace: "relaxed" | "balanced" | "packed") {
  return ROUTE_COMPOSITION_V2_CONFIG.feasibility.paceWaitLimits[pace];
}
