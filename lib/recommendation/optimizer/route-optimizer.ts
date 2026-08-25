import "server-only";

import { ROUTE_OBJECTIVE_V1_CONFIG } from "@/lib/recommendation/config/route-objective-v1";
import { ROUTE_SOLVER_V1_CONFIG } from "@/lib/recommendation/config/route-solver-v1";
import { explainExcludedPlaces, explainStops } from "@/lib/recommendation/optimizer/explanations";
import { validateFinalistsV1 } from "@/lib/recommendation/optimizer/final-validation";
import { searchRoutesV1 } from "@/lib/recommendation/optimizer/route-search";
import { tripStartMs } from "@/lib/recommendation/optimizer/schedule-simulator";
import type {
  RouteOptimizationInput,
  RouteOptimizationResult,
  RouteOptimizationTripRequest,
  ValidatedInternalRoute,
  ValidatedRouteAlternative,
} from "@/lib/recommendation/types/route-optimizer";
import type { TravelTimeProvider } from "@/lib/travel/types";

function alternativeFrom(
  type: ValidatedRouteAlternative["type"],
  value: ValidatedInternalRoute,
  tripRequest: RouteOptimizationTripRequest,
): ValidatedRouteAlternative {
  return {
    type,
    score: value.route.score,
    scoreBreakdown: value.route.scoreBreakdown,
    stopIds: value.route.orderedPlaceIds,
    startAt: new Date(tripStartMs(tripRequest)).toISOString(),
    endAt: new Date(value.route.currentTimeEpochMs).toISOString(),
    totalDrivingSeconds: value.route.totalDrivingSeconds,
    totalVisitSeconds: value.route.totalVisitSeconds,
    totalWaitSeconds: value.route.totalWaitSeconds,
    totalDistanceMeters: value.route.totalDistanceMeters,
    temporalBasis: value.validation.temporalBasis,
    stops: explainStops(value.route, tripRequest.selectedCategories),
    geometry: value.validation.geometry,
  };
}

function selectAlternatives(
  routes: ValidatedInternalRoute[],
  tripRequest: RouteOptimizationTripRequest,
): ValidatedRouteAlternative[] {
  if (routes.length < 2) return [];
  const main = routes[0];
  const remaining = routes.slice(1);
  const materiallyDifferent = (candidate: ValidatedInternalRoute) => {
    const leftSet = [...main.route.orderedPlaceIds].sort().join(",");
    const rightSet = [...candidate.route.orderedPlaceIds].sort().join(",");
    if (leftSet !== rightSet) return true;
    const edges = (ids: readonly string[]) =>
      new Set(ids.slice(1).map((id, index) => `${ids[index]}>${id}`));
    const leftEdges = edges(main.route.orderedPlaceIds);
    const rightEdges = edges(candidate.route.orderedPlaceIds);
    const difference =
      [...leftEdges].filter((edge) => !rightEdges.has(edge)).length +
      [...rightEdges].filter((edge) => !leftEdges.has(edge)).length;
    return difference >= 2;
  };
  const alternatives: ValidatedRouteAlternative[] = [];
  const lowerTravel = remaining
    .filter((item) => materiallyDifferent(item) && item.route.score >= main.route.score * ROUTE_OBJECTIVE_V1_CONFIG.lowerTravelAlternativeMinimumRatio)
    .sort((left, right) =>
      left.route.totalDrivingSeconds - right.route.totalDrivingSeconds ||
      left.route.signature.localeCompare(right.route.signature),
    )[0];
  if (lowerTravel) alternatives.push(alternativeFrom("lower_travel", lowerTravel, tripRequest));
  const used = new Set(alternatives.flatMap((item) => item.stopIds.join(">")));
  const popularityOriented = remaining
    .filter(
      (item) =>
        item.route.score >= main.route.score * ROUTE_OBJECTIVE_V1_CONFIG.popularityAlternativeMinimumRatio &&
        item.route.popularAnchorPlaceId !== null &&
        materiallyDifferent(item) &&
        !used.has(item.route.signature),
    )
    .sort((left, right) =>
      right.route.popularAnchorCount - left.route.popularAnchorCount ||
      right.route.score - left.route.score ||
      left.route.signature.localeCompare(right.route.signature),
    )[0];
  if (popularityOriented) alternatives.push(alternativeFrom("popularity_oriented", popularityOriented, tripRequest));
  return alternatives.slice(0, ROUTE_SOLVER_V1_CONFIG.maxReturnedAlternatives);
}

function validateOptimizationInput(input: RouteOptimizationInput): string[] {
  const reasons: string[] = [];
  if (input.candidates.length > ROUTE_SOLVER_V1_CONFIG.maxCandidates) reasons.push("candidate_limit_exceeded");
  if (new Set(input.candidates.map((item) => item.node.id)).size !== input.candidates.length) reasons.push("duplicate_candidate_id");
  if (
    input.candidates.some(
      (item) => {
        const tier = item.eligibilityTier ?? item.place?.eligibility.tier;
        const verdict = item.petAssessment ?? item.place?.assessment.verdict;
        const source = item.source ?? item.place?.source;
        return (
          tier === "explicitly_ineligible" ||
          verdict === "not_allowed" ||
          !["tourism_service2", "kakao_catalog"].includes(source ?? "")
        );
      },
    )
  ) {
    reasons.push("non_strict_candidate_rejected");
  }
  if (!input.matrix.nodeIds.includes(input.departure.id)) reasons.push("departure_missing_from_matrix");
  if (input.candidates.some((item) => !input.matrix.nodeIds.includes(item.node.id))) reasons.push("candidate_missing_from_matrix");
  return [...new Set(reasons)].sort();
}

export async function optimizeRouteV1(
  input: RouteOptimizationInput,
  dependencies: {
    travelTimeProvider: TravelTimeProvider;
    now?: () => number;
    solverDeadlineMs?: number;
    maxExpandedStates?: number;
  },
): Promise<RouteOptimizationResult> {
  const overallStarted = performance.now();
  const inputReasons = validateOptimizationInput(input);
  if (inputReasons.length > 0) {
    const safeDiagnostics = searchRoutesV1(
      { ...input, candidates: [] },
      { now: dependencies.now, deadlineMs: dependencies.solverDeadlineMs, maxStates: dependencies.maxExpandedStates },
    ).diagnostics;
    safeDiagnostics.candidateCount = input.candidates.length;
    safeDiagnostics.totalDurationMs = Math.max(0, Math.round(performance.now() - overallStarted));
    return { status: "solver_failed", reasonCodes: inputReasons, diagnostics: safeDiagnostics };
  }
  const search = searchRoutesV1(input, {
    now: dependencies.now,
    deadlineMs: dependencies.solverDeadlineMs,
    maxStates: dependencies.maxExpandedStates,
  });
  if (search.finalists.length === 0) {
    search.diagnostics.totalDurationMs = Math.max(0, Math.round(performance.now() - overallStarted));
    const missingEdges = search.diagnostics.prunedByMissingEdge > 0;
    return {
      status: missingEdges ? "matrix_incomplete" : "insufficient_feasible_route",
      reasonCodes: missingEdges
        ? ["no_feasible_route_with_resolved_provider_edges"]
        : ["no_route_satisfies_schedule_pace_and_trip_constraints"],
      diagnostics: search.diagnostics,
    };
  }
  const validated = await validateFinalistsV1({
    optimization: input,
    finalists: search.finalists,
    travelTimeProvider: dependencies.travelTimeProvider,
  });
  search.diagnostics.validationAttempts = validated.attempts;
  search.diagnostics.validationFailures = validated.failures;
  search.diagnostics.validatedRoutes = validated.routes.length;
  search.diagnostics.validationDurationMs = validated.durationMs;
  search.diagnostics.totalDurationMs = Math.max(0, Math.round(performance.now() - overallStarted));
  if (validated.routes.length === 0) {
    return {
      status: "final_validation_failed",
      reasonCodes: ["no_internal_finalist_passed_stage3_exact_route_validation"],
      diagnostics: search.diagnostics,
    };
  }
  const selected = validated.routes[0];
  const warnings = [...new Set([
    ...selected.route.warningCodes,
    ...(search.diagnostics.beamFallbackUsed ? ["exact_search_limit_reached_beam_fallback_used"] : []),
    ...(search.diagnostics.matrixTemporalBasis === "current_traffic"
      ? ["current_traffic_matrix_used_for_search"]
      : []),
    ...(selected.validation.temporalBasis === "future_departure"
      ? ["future_route_revalidated"]
      : []),
  ])].sort();
  return {
    status: "ready",
    engineVersion: ROUTE_SOLVER_V1_CONFIG.engineVersion,
    solverVersion: ROUTE_SOLVER_V1_CONFIG.version,
    objectiveVersion: ROUTE_OBJECTIVE_V1_CONFIG.version,
    searchOptimality: search.diagnostics.exactSearchCompleted
      ? "optimal_within_candidate_set_current_matrix"
      : "best_found_within_time_limit",
    validationSelection: validated.routes.length === 1
      ? "only_validated_candidate"
      : "best_validated_candidate",
    score: selected.route.score,
    scoreBreakdown: selected.route.scoreBreakdown,
    schedule: {
      startAt: new Date(tripStartMs(input.tripRequest)).toISOString(),
      endAt: new Date(selected.route.currentTimeEpochMs).toISOString(),
      matrixTemporalBasis: search.diagnostics.matrixTemporalBasis,
      finalValidationTemporalBasis: selected.validation.temporalBasis,
      totalDrivingSeconds: selected.route.totalDrivingSeconds,
      totalVisitSeconds: selected.route.totalVisitSeconds,
      totalWaitSeconds: selected.route.totalWaitSeconds,
      totalDistanceMeters: selected.route.totalDistanceMeters,
    },
    stops: explainStops(selected.route, input.tripRequest.selectedCategories),
    geometry: selected.validation.geometry,
    alternatives: selectAlternatives(validated.routes, input.tripRequest),
    excludedHighlights: explainExcludedPlaces({ optimization: input, selected: selected.route }),
    warnings,
    diagnostics: search.diagnostics,
  };
}

export type {
  RouteOptimizationCandidate,
  RouteOptimizationInput,
  RouteOptimizationResult,
  RouteOptimizationTripRequest,
} from "@/lib/recommendation/types/route-optimizer";
