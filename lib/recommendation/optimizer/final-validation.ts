import "server-only";

import { ROUTE_SOLVER_V1_CONFIG } from "@/lib/recommendation/config/route-solver-v1";
import { compareCompletedRoutes, scoreCompletedRouteV1 } from "@/lib/recommendation/optimizer/route-score";
import { appendScheduledVisit, tripStartMs } from "@/lib/recommendation/optimizer/schedule-simulator";
import type {
  CompletedRouteCandidate,
  RouteOptimizationInput,
  ValidatedInternalRoute,
} from "@/lib/recommendation/types/route-optimizer";
import type { TravelMatrixEdge, TravelTimeProvider } from "@/lib/travel/types";

function sectionEdge(section: {
  fromId: string;
  toId: string;
  distanceMeters: number;
  durationSeconds: number;
}, temporalBasis: TravelMatrixEdge["temporalBasis"]): TravelMatrixEdge {
  return {
    ...section,
    lowerBoundMeters: null,
    status: "resolved",
    source: "kakao_directions_live",
    confidence: "validated",
    temporalBasis,
    distanceFetchedAt: null,
    durationFetchedAt: null,
    reasonCodes: ["final_route_validation"],
  };
}

function resimulate(input: {
  optimization: RouteOptimizationInput;
  internal: CompletedRouteCandidate;
  validation: ValidatedInternalRoute["validation"];
}): CompletedRouteCandidate | null {
  const start = tripStartMs(input.optimization.tripRequest);
  const visits = [];
  let currentTimeMs = start;
  const stopCount = input.internal.visits.length;
  if (input.validation.sections.length !== stopCount + (input.optimization.tripRequest.roundTrip ? 1 : 0)) {
    return null;
  }
  for (let index = 0; index < stopCount; index += 1) {
    const expected = input.internal.visits[index].candidate;
    const section = input.validation.sections[index];
    const expectedFrom = index === 0
      ? input.optimization.departure.id
      : input.internal.visits[index - 1].candidate.node.id;
    if (section.fromId !== expectedFrom || section.toId !== expected.node.id) return null;
    const appended = appendScheduledVisit({
      candidate: expected,
      edge: sectionEdge(section, input.validation.temporalBasis),
      currentTimeMs,
      serviceDayStartMs: start,
      tripRequest: input.optimization.tripRequest,
    });
    if (!appended) return null;
    visits.push(appended.visit);
    currentTimeMs = appended.visit.departureAtMs;
  }
  const returnSection = input.optimization.tripRequest.roundTrip
    ? input.validation.sections.at(-1)
    : undefined;
  if (
    returnSection &&
    (returnSection.fromId !== visits.at(-1)?.candidate.node.id ||
      returnSection.toId !== input.optimization.departure.id)
  ) return null;
  return scoreCompletedRouteV1({
    visits,
    departureId: input.optimization.departure.id,
    serviceDayStartMs: start,
    matrix: input.optimization.matrix,
    tripRequest: input.optimization.tripRequest,
    returnTravel: returnSection
      ? { seconds: returnSection.durationSeconds, meters: returnSection.distanceMeters }
      : undefined,
  });
}

export async function validateFinalistsV1(input: {
  optimization: RouteOptimizationInput;
  finalists: CompletedRouteCandidate[];
  travelTimeProvider: TravelTimeProvider;
}): Promise<{
  routes: ValidatedInternalRoute[];
  attempts: number;
  failures: number;
  durationMs: number;
}> {
  const started = performance.now();
  const routes: ValidatedInternalRoute[] = [];
  let attempts = 0;
  let failures = 0;
  for (const internal of input.finalists.slice(0, ROUTE_SOLVER_V1_CONFIG.maxFinalValidationAttempts)) {
    attempts += 1;
    const validation = await input.travelTimeProvider.validateOrderedRoute({
      departure: input.optimization.departure,
      orderedStops: internal.visits.map((visit) => visit.candidate.node),
      roundTrip: input.optimization.tripRequest.roundTrip,
      requestedDepartureAt: new Date(tripStartMs(input.optimization.tripRequest)).toISOString(),
      priority: "TIME",
      avoid: [],
      includeGeometry: true,
    });
    if (validation.status !== "validated") {
      failures += 1;
      continue;
    }
    const exactValidation = validation as ValidatedInternalRoute["validation"];
    const route = resimulate({
      optimization: input.optimization,
      internal,
      validation: exactValidation,
    });
    if (!route) {
      failures += 1;
      continue;
    }
    routes.push({ route, validation: exactValidation });
  }
  routes.sort((left, right) => compareCompletedRoutes(left.route, right.route));
  return {
    routes,
    attempts,
    failures,
    durationMs: Math.max(0, Math.round(performance.now() - started)),
  };
}
