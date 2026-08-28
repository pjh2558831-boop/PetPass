import "server-only";

import { explainExcludedPlaces, explainStops } from "@/lib/recommendation/optimizer/explanations";
import { validateFinalistsV1 } from "@/lib/recommendation/optimizer/final-validation";
import { searchRoutesV1 } from "@/lib/recommendation/optimizer/route-search";
import { tripStartMs } from "@/lib/recommendation/optimizer/schedule-simulator";
import type {
  CompletedRouteCandidate,
  ExcludedPlaceExplanation,
  RecommendedRouteStop,
  RouteOptimizationInput,
  RouteSearchOptimality,
  RouteSolverDiagnostics,
  ValidatedInternalRoute,
} from "@/lib/recommendation/types/route-optimizer";
import {
  selectRouteStyleOptionsV2,
  type RouteStyleIdV2,
  type RouteStyleSelectionCandidateV2,
} from "@/lib/recommendation/v2/route-options";
import type { TravelTimeProvider } from "@/lib/travel/types";

export interface OptimizedRouteOptionV2 {
  style: RouteStyleIdV2;
  route: CompletedRouteCandidate;
  stops: RecommendedRouteStop[];
  geometry: Array<{ latitude: number; longitude: number }>;
  temporalBasis: ValidatedInternalRoute["validation"]["temporalBasis"];
  explanationCodes: string[];
}

export type RouteOptionsOptimizationResultV2 =
  | {
      status: "ready";
      options: OptimizedRouteOptionV2[];
      alternativeAvailability: "available" | "limited";
      optimality: RouteSearchOptimality;
      excludedHighlights: ExcludedPlaceExplanation[];
      warnings: string[];
      diagnostics: RouteSolverDiagnostics;
    }
  | {
      status: "insufficient_feasible_route" | "matrix_incomplete" | "final_validation_failed";
      reasonCodes: string[];
      diagnostics: RouteSolverDiagnostics;
    };

interface SelectableRoute extends RouteStyleSelectionCandidateV2 {
  internal: CompletedRouteCandidate;
}

function selectable(route: CompletedRouteCandidate): SelectableRoute {
  const styleScores = route.visits.reduce(
    (scores, { candidate }) => {
      const utility = candidate.personalization?.styleUtilities;
      scores.comfort += utility?.comfort ?? candidate.placeUtility.total;
      scores.preference += utility?.preference ?? candidate.placeUtility.total;
      scores.efficient += utility?.efficient ?? candidate.placeUtility.total;
      return scores;
    },
    { comfort: 0, preference: 0, efficient: 0 },
  );
  return {
    internal: route,
    signature: route.signature,
    orderedPlaceIds: route.orderedPlaceIds,
    totalDrivingSeconds: route.totalDrivingSeconds,
    totalDistanceMeters: route.totalDistanceMeters,
    maximumLegSeconds: Math.max(0, ...route.visits.map(({ travelSeconds }) => travelSeconds)),
    categoryCount: new Set(route.visits.map(({ candidate }) => candidate.category)).size,
    unknownScheduleCount: route.unknownScheduleCount,
    styleScores,
  };
}

export async function optimizeRouteOptionsV2(
  input: RouteOptimizationInput,
  dependencies: {
    travelTimeProvider: TravelTimeProvider;
    recentRouteSignatures: readonly string[];
    rerollVariant: number;
    now?: () => number;
    solverDeadlineMs?: number;
    maxExpandedStates?: number;
  },
): Promise<RouteOptionsOptimizationResultV2> {
  const started = performance.now();
  const search = searchRoutesV1(input, {
    now: dependencies.now,
    deadlineMs: dependencies.solverDeadlineMs,
    maxStates: dependencies.maxExpandedStates,
  });
  if (search.finalists.length === 0) {
    search.diagnostics.totalDurationMs = Math.max(0, Math.round(performance.now() - started));
    const matrixIncomplete = search.diagnostics.prunedByMissingEdge > 0;
    return {
      status: matrixIncomplete ? "matrix_incomplete" : "insufficient_feasible_route",
      reasonCodes: matrixIncomplete
        ? ["no_feasible_route_with_resolved_provider_edges"]
        : ["no_route_satisfies_schedule_pace_and_trip_constraints"],
      diagnostics: search.diagnostics,
    };
  }

  const selected = selectRouteStyleOptionsV2({
    routes: search.finalists.map(selectable),
    recentRouteSignatures: dependencies.recentRouteSignatures,
    rerollVariant: dependencies.rerollVariant,
  });
  const selectedOptions = input.tripRequest.requiredPlaceIds?.length
    ? selected.options.slice(0, 1)
    : selected.options;
  const options: OptimizedRouteOptionV2[] = [];
  let attempts = 0;
  let failures = 0;
  let validationDurationMs = 0;
  const validations = await Promise.all(selectedOptions.map(async (option) => ({
    option,
    validated: await validateFinalistsV1({
      optimization: input,
      finalists: [option.route.internal],
      travelTimeProvider: dependencies.travelTimeProvider,
    }),
  })));
  for (const { option, validated } of validations) {
    attempts += validated.attempts;
    failures += validated.failures;
    validationDurationMs += validated.durationMs;
    const exact = validated.routes[0];
    if (!exact) continue;
    options.push({
      style: option.style,
      route: exact.route,
      stops: explainStops(exact.route, input.tripRequest.selectedCategories),
      geometry: exact.validation.geometry,
      temporalBasis: exact.validation.temporalBasis,
      explanationCodes: [
        `route_style_${option.style}`,
        option.style === "efficient" ? "lowest_practical_travel_cost" :
          option.style === "comfort" ? "pet_comfort_and_lower_burden" :
            "preference_and_trip_mood_fit",
      ],
    });
  }
  search.diagnostics.validationAttempts = attempts;
  search.diagnostics.validationFailures = failures;
  search.diagnostics.validatedRoutes = options.length;
  search.diagnostics.validationDurationMs = validationDurationMs;
  search.diagnostics.totalDurationMs = Math.max(0, Math.round(performance.now() - started));
  if (options.length === 0) {
    return {
      status: "final_validation_failed",
      reasonCodes: ["no_selected_route_option_passed_exact_validation"],
      diagnostics: search.diagnostics,
    };
  }
  const primary = options[0]!.route;
  return {
    status: "ready",
    options,
    alternativeAvailability:
      options.length === 3 && selected.alternativeAvailability === "available"
        ? "available"
        : "limited",
    optimality: search.diagnostics.exactSearchCompleted
      ? "optimal_within_candidate_set_current_matrix"
      : "best_found_within_time_limit",
    excludedHighlights: explainExcludedPlaces({ optimization: input, selected: primary }),
    warnings: [
      ...(search.diagnostics.beamFallbackUsed
        ? ["exact_search_limit_reached_beam_fallback_used"]
        : []),
      ...(search.diagnostics.matrixTemporalBasis === "current_traffic"
        ? ["current_traffic_matrix_used_for_search"]
        : []),
      ...(options.some(({ temporalBasis }) => temporalBasis === "future_departure")
        ? ["future_route_revalidated"]
        : []),
    ].sort(),
    diagnostics: search.diagnostics,
  };
}

export function routeOptionScheduleV2(
  option: OptimizedRouteOptionV2,
  input: RouteOptimizationInput,
) {
  return {
    startAt: new Date(tripStartMs(input.tripRequest)).toISOString(),
    endAt: new Date(option.route.currentTimeEpochMs).toISOString(),
    matrixTemporalBasis: input.matrix.edges[input.departure.id]
      ? Object.values(input.matrix.edges[input.departure.id]!).find(({ status }) => status === "resolved")?.temporalBasis ?? "unknown"
      : "unknown",
    finalValidationTemporalBasis: option.temporalBasis,
    totalDrivingSeconds: option.route.totalDrivingSeconds,
    totalVisitSeconds: option.route.totalVisitSeconds,
    totalWaitSeconds: option.route.totalWaitSeconds,
    totalDistanceMeters: option.route.totalDistanceMeters,
  };
}
