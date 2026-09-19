import "server-only";

import { ROUTE_SOLVER_V1_CONFIG } from "@/lib/recommendation/config/route-solver-v1";
import { ROUTE_COMPOSITION_V2_CONFIG } from "@/lib/recommendation/config/route-composition-v2";
import type {
  RouteOptimizationCandidate,
  RouteOptimizationTripRequest,
  ScheduledRouteVisit,
} from "@/lib/recommendation/types/route-optimizer";

export function getRouteTripConstraints(request: RouteOptimizationTripRequest) {
  const pace = ROUTE_SOLVER_V1_CONFIG.pace[request.tripPace];
  const targetStops = request.desiredStopCount ?? pace.targetStops;
  return {
    targetStops,
    minStops: request.minimumStopCount ??
      (request.allowReducedStops ? 1 : Math.min(pace.minStops, targetStops)),
    maxStops: request.desiredStopCount ?? pace.maxStops,
    maxDurationMinutes: request.durationMinutes ?? pace.maxDurationMinutes,
  };
}

export function canAddDiningCandidate(input: {
  request: RouteOptimizationTripRequest;
  visits: readonly ScheduledRouteVisit[];
  candidate: RouteOptimizationCandidate;
  candidates: readonly RouteOptimizationCandidate[];
}): boolean {
  const kind = input.candidate.diningCategory;
  if (!kind || input.candidate.locked) return true;
  const limit = ROUTE_COMPOSITION_V2_CONFIG.diningCategoryLimit[input.request.tripPace];
  const selectedCount = input.candidates.filter(
    (candidate) => candidate.locked && candidate.diningCategory === kind,
  ).length;
  const visitedCount = input.visits.filter(
    ({ candidate }) => candidate.diningCategory === kind,
  ).length;
  return Math.max(selectedCount, visitedCount) < limit;
}
