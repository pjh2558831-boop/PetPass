import "server-only";

import { ROUTE_SOLVER_V1_CONFIG } from "@/lib/recommendation/config/route-solver-v1";
import type { RouteOptimizationTripRequest } from "@/lib/recommendation/types/route-optimizer";

export function getRouteTripConstraints(request: RouteOptimizationTripRequest) {
  const pace = ROUTE_SOLVER_V1_CONFIG.pace[request.tripPace];
  const targetStops = request.desiredStopCount ?? pace.targetStops;
  return {
    targetStops,
    minStops: request.allowReducedStops ? 1 : Math.min(pace.minStops, targetStops),
    maxStops: request.desiredStopCount ?? pace.maxStops,
    maxDurationMinutes: request.durationMinutes ?? pace.maxDurationMinutes,
  };
}
