import "server-only";

import { ROUTE_OBJECTIVE_V1_CONFIG } from "@/lib/recommendation/config/route-objective-v1";
import { ROUTE_SOLVER_V1_CONFIG } from "@/lib/recommendation/config/route-solver-v1";
import { paceWaitLimitsV2 } from "@/lib/recommendation/config/route-composition-v2";
import { getRouteTripConstraints } from "@/lib/recommendation/optimizer/trip-constraints";
import { compareCompletedRoutes, scoreCompletedRouteV1 } from "@/lib/recommendation/optimizer/route-score";
import {
  appendScheduledVisit,
  isUsableTravelEdge,
  tripStartMs,
} from "@/lib/recommendation/optimizer/schedule-simulator";
import type {
  CompletedRouteCandidate,
  RouteOptimizationInput,
  RouteSolverDiagnostics,
  ScheduledRouteVisit,
} from "@/lib/recommendation/types/route-optimizer";
import type { TravelTimeTemporalBasis } from "@/lib/travel/types";

interface PartialState {
  visits: ScheduledRouteVisit[];
  used: Set<string>;
  currentNodeId: string;
  currentTimeMs: number;
  unknownCount: number;
  partialScore: number;
  signature: string;
}

export interface RouteSearchResult {
  finalists: CompletedRouteCandidate[];
  diagnostics: RouteSolverDiagnostics;
}

function emptyDiagnostics(
  matrixTemporalBasis: TravelTimeTemporalBasis,
): RouteSolverDiagnostics {
  return {
    candidateCount: 0,
    expandedStates: 0,
    prunedByBound: 0,
    prunedByTimeWindow: 0,
    prunedByDuration: 0,
    prunedByMissingEdge: 0,
    prunedByConstraint: 0,
    completedRoutes: 0,
    exactSearchCompleted: false,
    deadlineExceeded: false,
    stateLimitExceeded: false,
    beamFallbackUsed: false,
    internalFinalists: 0,
    validationAttempts: 0,
    validationFailures: 0,
    validatedRoutes: 0,
    matrixTemporalBasis,
    solverDurationMs: 0,
    validationDurationMs: 0,
    totalDurationMs: 0,
  };
}

function insertFinalist(
  finalists: CompletedRouteCandidate[],
  route: CompletedRouteCandidate,
): void {
  const selectedSet = [...route.orderedPlaceIds].sort().join(",");
  const directedEdges = (value: CompletedRouteCandidate) => {
    const result = new Set<string>();
    for (let index = 1; index < value.orderedPlaceIds.length; index += 1) {
      result.add(`${value.orderedPlaceIds[index - 1]}>${value.orderedPlaceIds[index]}`);
    }
    return result;
  };
  const routeEdges = directedEdges(route);
  const nearDuplicateIndex = finalists.findIndex((item) => {
    if ([...item.orderedPlaceIds].sort().join(",") !== selectedSet) return false;
    const itemEdges = directedEdges(item);
    const difference =
      [...routeEdges].filter((edge) => !itemEdges.has(edge)).length +
      [...itemEdges].filter((edge) => !routeEdges.has(edge)).length;
    return difference < 2;
  });
  if (nearDuplicateIndex >= 0) {
    if (compareCompletedRoutes(route, finalists[nearDuplicateIndex]) < 0) {
      finalists[nearDuplicateIndex] = route;
      finalists.sort(compareCompletedRoutes);
    }
    return;
  }
  const existing = finalists.findIndex((item) => item.signature === route.signature);
  if (existing >= 0) {
    if (compareCompletedRoutes(route, finalists[existing]) < 0) finalists[existing] = route;
  } else {
    finalists.push(route);
  }
  finalists.sort(compareCompletedRoutes);
  finalists.splice(ROUTE_SOLVER_V1_CONFIG.maxInternalFinalists);
}

function accommodationAllowed(input: RouteOptimizationInput, state: PartialState, candidateRole: string): boolean {
  if (candidateRole !== "accommodation") return true;
  if (
    input.tripRequest.planningPolicy !== "full_public_catalog_v1" &&
    input.tripRequest.tripType === "day_trip" &&
    !input.tripRequest.selectedCategories.includes("accommodation")
  ) {
    return false;
  }
  return state.visits.every((visit) => visit.candidate.visitRole !== "accommodation");
}

function completedConstraint(input: RouteOptimizationInput, visits: ScheduledRouteVisit[]): boolean {
  const pace = getRouteTripConstraints(input.tripRequest);
  const effectiveMinimum = Math.min(
    pace.minStops,
    Math.max(1, input.candidates.length),
  );
  if (visits.length < effectiveMinimum || visits.length > pace.maxStops) return false;
  const visitedIds = new Set(visits.map(({ candidate }) => candidate.node.id));
  if (input.tripRequest.requiredPlaceIds?.some((placeId) => !visitedIds.has(placeId))) {
    return false;
  }
  const placement = input.tripRequest.selectedPlacePlacement;
  if (placement) {
    const locked = visits.map(({ candidate }) => Boolean(candidate.locked));
    const firstOptional = locked.indexOf(false);
    const firstSelected = locked.indexOf(true);
    if (
      (placement === "before_recommendations" && firstOptional >= 0 && locked.slice(firstOptional).includes(true)) ||
      (placement === "after_recommendations" && firstSelected >= 0 && locked.slice(firstSelected).includes(false))
    ) return false;
  }
  const requestedCategories = new Set(input.tripRequest.selectedCategories);
  const coveredRequestedCategories = new Set(
    visits
      .filter(({ candidate }) => input.tripRequest.planningPolicy === "full_public_catalog_v1" || candidate.locked ||
        (candidate.eligibilityTier !== "unverified" && candidate.evidenceStatus !== "unverified"))
      .map(({ candidate }) => candidate.category)
      .filter((category) => requestedCategories.has(category)),
  ).size;
  if (coveredRequestedCategories < (input.tripRequest.minimumRequestedCategoryCount ?? 0)) return false;
  if (input.tripRequest.tripType === "overnight") {
    return visits.at(-1)?.candidate.visitRole === "accommodation";
  }
  return true;
}

function completion(
  input: RouteOptimizationInput,
  visits: ScheduledRouteVisit[],
  fastestTravelCache: Map<string, number>,
) {
  if (!completedConstraint(input, visits)) return null;
  const serviceDayStartMs = tripStartMs(input.tripRequest);
  let returnTravel: { seconds: number; meters: number } | undefined;
  if (input.tripRequest.roundTrip) {
    const from = visits.at(-1)?.candidate.node.id;
    const edge = from ? input.matrix.edges[from]?.[input.departure.id] : undefined;
    if (!isUsableTravelEdge(edge)) return null;
    returnTravel = { seconds: edge.durationSeconds, meters: edge.distanceMeters };
    const end = visits.at(-1)!.departureAtMs + edge.durationSeconds * 1000;
    const pace = getRouteTripConstraints(input.tripRequest);
    if (end - serviceDayStartMs > pace.maxDurationMinutes * 60_000) return null;
  }
  return scoreCompletedRouteV1({
    visits,
    departureId: input.departure.id,
    serviceDayStartMs,
    matrix: input.matrix,
    tripRequest: input.tripRequest,
    returnTravel,
    fastestTravelCache,
  });
}

function partialHeuristic(visits: ScheduledRouteVisit[]): number {
  const utility = visits.reduce(
    (sum, visit, index) =>
      sum + visit.candidate.placeUtility.total * ROUTE_OBJECTIVE_V1_CONFIG.positionDiscount[index],
    0,
  );
  const drive = visits.reduce((sum, visit) => sum + visit.travelSeconds, 0);
  const unknown = visits.filter((visit) => visit.candidate.planningPolicy !== "full_public_catalog_v1" && visit.candidate.schedule.status === "unknown").length;
  return utility - (drive / 60) * ROUTE_OBJECTIVE_V1_CONFIG.drivingPenaltyPerMinute -
    unknown * ROUTE_OBJECTIVE_V1_CONFIG.unknownSchedulePenalty;
}

function safeUpperBound(input: RouteOptimizationInput, state: PartialState): number {
  const maxStops = getRouteTripConstraints(input.tripRequest).maxStops;
  const open = input.candidates
    .filter((candidate) => !state.used.has(candidate.node.id))
    .map((candidate) => candidate.placeUtility.total)
    .sort((left, right) => right - left);
  let utility = state.visits.reduce(
    (sum, visit, index) =>
      sum + visit.candidate.placeUtility.total * ROUTE_OBJECTIVE_V1_CONFIG.positionDiscount[index],
    0,
  );
  for (let index = state.visits.length; index < maxStops; index += 1) {
    utility += (open[index - state.visits.length] ?? 0) * ROUTE_OBJECTIVE_V1_CONFIG.positionDiscount[index];
  }
  // Deliberately generous: the bound must never discard a possible optimum.
  return utility + 1_500;
}

function expandState(
  input: RouteOptimizationInput,
  state: PartialState,
  candidateIndex: number,
  diagnostics: RouteSolverDiagnostics,
): PartialState | null {
  const candidate = input.candidates[candidateIndex];
  if (state.used.has(candidate.node.id)) return null;
  if (!accommodationAllowed(input, state, candidate.visitRole)) {
    diagnostics.prunedByConstraint += 1;
    return null;
  }
  if (state.visits.at(-1)?.candidate.visitRole === "accommodation") {
    diagnostics.prunedByConstraint += 1;
    return null;
  }
  if (input.tripRequest.planningPolicy !== "full_public_catalog_v1" && candidate.schedule.mandatoryReservationImpossible) {
    diagnostics.prunedByConstraint += 1;
    return null;
  }
  if (
    input.tripRequest.planningPolicy !== "full_public_catalog_v1" &&
    candidate.schedule.status === "unknown" &&
    !input.tripRequest.scheduleIntent &&
    !candidate.locked &&
    state.unknownCount >= ROUTE_SOLVER_V1_CONFIG.maxUnknownScheduleStops
  ) {
    diagnostics.prunedByConstraint += 1;
    return null;
  }
  const edge = input.matrix.edges[state.currentNodeId]?.[candidate.node.id];
  if (!isUsableTravelEdge(edge)) {
    diagnostics.prunedByMissingEdge += 1;
    return null;
  }
  const serviceDayStartMs = tripStartMs(input.tripRequest);
  const appended = appendScheduledVisit({
    candidate,
    edge,
    currentTimeMs: state.currentTimeMs,
    serviceDayStartMs,
    tripRequest: input.tripRequest,
  });
  if (!appended) {
    const arrival = state.currentTimeMs + edge.durationSeconds * 1000;
    const pace = getRouteTripConstraints(input.tripRequest);
    if (arrival - serviceDayStartMs > pace.maxDurationMinutes * 60_000) {
      diagnostics.prunedByDuration += 1;
    } else {
      diagnostics.prunedByTimeWindow += 1;
    }
    return null;
  }
  const visits = [...state.visits, appended.visit];
  const waitLimits = paceWaitLimitsV2(input.tripRequest.tripPace);
  const totalWaitSeconds = visits.reduce((sum, visit) => sum + visit.waitSeconds, 0);
  if (
    appended.visit.waitSeconds > waitLimits.maximumSingleWaitMinutes * 60 ||
    totalWaitSeconds > waitLimits.maximumTotalWaitMinutes * 60
  ) {
    diagnostics.prunedByConstraint += 1;
    return null;
  }
  return {
    visits,
    used: new Set([...state.used, candidate.node.id]),
    currentNodeId: candidate.node.id,
    currentTimeMs: appended.visit.departureAtMs,
    unknownCount: state.unknownCount + (candidate.locked ? 0 : appended.unknownIncrement),
    partialScore: partialHeuristic(visits),
    signature: visits.map((visit) => visit.candidate.node.id).join(">"),
  };
}

function beamSearch(
  input: RouteOptimizationInput,
  diagnostics: RouteSolverDiagnostics,
): CompletedRouteCandidate[] {
  const start = tripStartMs(input.tripRequest);
  let beam: PartialState[] = [{
    visits: [], used: new Set(), currentNodeId: input.departure.id,
    currentTimeMs: start, unknownCount: 0, partialScore: 0, signature: "",
  }];
  const finalists: CompletedRouteCandidate[] = [];
  const fastestTravelCache = new Map<string, number>();
  const maxStops = getRouteTripConstraints(input.tripRequest).maxStops;
  for (let depth = 0; depth < maxStops; depth += 1) {
    const next: PartialState[] = [];
    for (const state of beam) {
      for (let index = 0; index < input.candidates.length; index += 1) {
        const expanded = expandState(input, state, index, diagnostics);
        if (!expanded) continue;
        const route = completion(input, expanded.visits, fastestTravelCache);
        if (route) insertFinalist(finalists, route);
        if (expanded.visits.at(-1)?.candidate.visitRole !== "accommodation") next.push(expanded);
      }
    }
    next.sort((left, right) => right.partialScore - left.partialScore || left.signature.localeCompare(right.signature));
    beam = next.slice(0, ROUTE_SOLVER_V1_CONFIG.beamWidth);
  }
  return finalists;
}

export function searchRoutesV1(
  input: RouteOptimizationInput,
  options: { now?: () => number; deadlineMs?: number; maxStates?: number } = {},
): RouteSearchResult {
  const canonicalInput: RouteOptimizationInput = {
    ...input,
    candidates: [...input.candidates].sort(
      (left, right) =>
        right.placeUtility.total - left.placeUtility.total ||
        right.placeUtility.categoryPriority - left.placeUtility.categoryPriority ||
        left.node.id.localeCompare(right.node.id),
    ),
  };
  input = canonicalInput;
  const now = options.now ?? (() => performance.now());
  const started = now();
  const deadlineMs = options.deadlineMs ?? ROUTE_SOLVER_V1_CONFIG.solverDeadlineMs;
  const stateLimit = options.maxStates ?? ROUTE_SOLVER_V1_CONFIG.maxExpandedStates;
  const temporalBasis = Object.values(input.matrix.edges)
    .flatMap((row) => Object.values(row))
    .find((edge) => edge.status === "resolved")?.temporalBasis ?? "unknown";
  const diagnostics = emptyDiagnostics(temporalBasis);
  diagnostics.candidateCount = input.candidates.length;
  const pace = getRouteTripConstraints(input.tripRequest);
  const start = tripStartMs(input.tripRequest);
  const root: PartialState = {
    visits: [], used: new Set(), currentNodeId: input.departure.id,
    currentTimeMs: start, unknownCount: 0, partialScore: 0, signature: "",
  };
  const finalists: CompletedRouteCandidate[] = [];
  const fastestTravelCache = new Map<string, number>();
  let stopped = false;

  const searchBudgetExceeded = (): boolean => {
    if (diagnostics.expandedStates >= stateLimit) {
      diagnostics.stateLimitExceeded = true;
      stopped = true;
    }
    if (now() - started >= deadlineMs) {
      diagnostics.deadlineExceeded = true;
      stopped = true;
    }
    return stopped;
  };

  const dfs = (state: PartialState): void => {
    input.signal?.throwIfAborted();
    if (stopped || state.visits.length >= pace.maxStops || searchBudgetExceeded()) return;
    if (
      finalists.length >= ROUTE_SOLVER_V1_CONFIG.maxInternalFinalists &&
      safeUpperBound(input, state) < finalists.at(-1)!.score
    ) {
      diagnostics.prunedByBound += 1;
      return;
    }
    for (let index = 0; index < input.candidates.length; index += 1) {
      input.signal?.throwIfAborted();
      if (searchBudgetExceeded()) return;
      diagnostics.expandedStates += 1;
      const expanded = expandState(input, state, index, diagnostics);
      if (!expanded) continue;
      const route = completion(input, expanded.visits, fastestTravelCache);
      if (route) {
        diagnostics.completedRoutes += 1;
        insertFinalist(finalists, route);
      }
      if (expanded.visits.at(-1)?.candidate.visitRole !== "accommodation") dfs(expanded);
      if (stopped) return;
    }
  };
  dfs(root);
  diagnostics.exactSearchCompleted = !stopped;
  if (stopped && !input.tripRequest.scheduleIntent && input.tripRequest.planningPolicy !== "full_public_catalog_v1") {
    diagnostics.beamFallbackUsed = true;
    for (const route of beamSearch(input, diagnostics)) insertFinalist(finalists, route);
  }
  diagnostics.internalFinalists = finalists.length;
  diagnostics.solverDurationMs = Math.max(0, Math.round(now() - started));
  diagnostics.totalDurationMs = diagnostics.solverDurationMs;
  return { finalists, diagnostics };
}
