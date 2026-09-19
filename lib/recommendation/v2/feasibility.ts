import "server-only";

import { ROUTE_COMPOSITION_V2_CONFIG, paceWaitLimitsV2 } from "@/lib/recommendation/config/route-composition-v2";
import { canAddDiningCandidate, getRouteTripConstraints } from "@/lib/recommendation/optimizer/trip-constraints";
import { appendScheduledVisit, isUsableTravelEdge, tripStartMs } from "@/lib/recommendation/optimizer/schedule-simulator";
import type { RouteOptimizationInput, ScheduledRouteVisit } from "@/lib/recommendation/types/route-optimizer";

export type RouteFeasibilityReasonCodeV2 =
  | "eligible_candidates_below_requested_stop_count"
  | "operating_hours_limit_stop_count"
  | "trip_duration_limits_stop_count"
  | "unresolved_travel_edges_limit_stop_count"
  | "excessive_wait_for_pace"
  | "requested_category_coverage_partially_feasible"
  | "selected_place_temporally_or_physically_infeasible"
  | "no_feasible_route";

export interface RouteFeasibilityReadyV2 {
  bestRouteIds?: string[];
  minimumWaitSeconds?: number;
  status: "ready";
  requestedStopCount: number;
  maximumFeasibleStopCount: number;
  targetStopCount: number;
  maximumRequestedCategoryCount: number;
  requiredRequestedCategoryCount: number;
  fullCategoryCoverageFeasible: boolean;
  feasibleCandidateIds: string[];
  limitingReasonCodes: RouteFeasibilityReasonCodeV2[];
}

export interface RouteFeasibilityFailureV2 {
  bestRouteIds?: string[];
  status: "insufficient_feasible_route";
  requestedStopCount: number;
  maximumFeasibleStopCount: 0;
  targetStopCount: 0;
  maximumRequestedCategoryCount: 0;
  requiredRequestedCategoryCount: 0;
  fullCategoryCoverageFeasible: false;
  feasibleCandidateIds: string[];
  limitingReasonCodes: RouteFeasibilityReasonCodeV2[];
}

export type RouteFeasibilityResultV2 = RouteFeasibilityReadyV2 | RouteFeasibilityFailureV2;

interface FeasibilityState {
  visits: ScheduledRouteVisit[];
  used: Set<string>;
  currentNodeId: string;
  currentTimeMs: number;
  unknownCount: number;
}

function countsForCategoryCoverage(candidate: ScheduledRouteVisit["candidate"], fullCatalog: boolean): boolean {
  return Boolean(
    fullCatalog || candidate.locked ||
    (candidate.eligibilityTier !== "unverified" && candidate.evidenceStatus !== "unverified"),
  );
}

function canFinish(input: RouteOptimizationInput, visits: readonly ScheduledRouteVisit[]): boolean {
  if (visits.length === 0) return false;
  const visited = new Set(visits.map(({ candidate }) => candidate.node.id));
  if (input.tripRequest.requiredPlaceIds?.some((id) => !visited.has(id))) return false;
  if (input.tripRequest.tripType === "overnight" && visits.at(-1)?.candidate.visitRole !== "accommodation") {
    return false;
  }
  if (!input.tripRequest.roundTrip) return true;
  const last = visits.at(-1)!;
  const returnEdge = input.matrix.edges[last.candidate.node.id]?.[input.departure.id];
  if (!isUsableTravelEdge(returnEdge)) return false;
  const endMs = last.departureAtMs + returnEdge.durationSeconds * 1_000;
  return endMs - tripStartMs(input.tripRequest) <=
    getRouteTripConstraints(input.tripRequest).maxDurationMinutes * 60_000;
}

function accommodationAllowed(input: RouteOptimizationInput, state: FeasibilityState, role: string): boolean {
  if (state.visits.at(-1)?.candidate.visitRole === "accommodation") return false;
  if (role !== "accommodation") return true;
  if (input.tripRequest.planningPolicy !== "full_public_catalog_v1" && input.tripRequest.tripType === "day_trip" && !input.tripRequest.selectedCategories.includes("accommodation")) {
    return false;
  }
  return state.visits.every(({ candidate }) => candidate.visitRole !== "accommodation");
}

/**
 * Provider-neutral feasibility pass. It uses only resolved matrix edges and the
 * same schedule simulator as optimization, then fixes the honest target before
 * any utility scoring is allowed to choose a route.
 */
export interface FeasibilityBudget {
  remainingStates: number;
  deadline: number;
  reservedStates?: number;
  reservedTimeMs?: number;
}

export function feasibilityBudgetExhausted(budget: FeasibilityBudget): boolean {
  return budget.remainingStates <= (budget.reservedStates ?? 0) ||
    performance.now() >= budget.deadline - (budget.reservedTimeMs ?? 0);
}

export function analyzeRouteFeasibilityV2(input: RouteOptimizationInput, budget?: FeasibilityBudget): RouteFeasibilityResultV2 {
  const fullCatalog = input.tripRequest.planningPolicy === "full_public_catalog_v1";
  const constraints = getRouteTripConstraints(input.tripRequest);
  const requestedStopCount = Math.min(5, input.tripRequest.desiredStopCount ?? constraints.targetStops);
  const requestedCategories = new Set(input.tripRequest.selectedCategories);
  const waitLimits = paceWaitLimitsV2(input.tripRequest.tripPace);
  const startMs = tripStartMs(input.tripRequest);
  const feasibleCandidateIds = new Set<string>();
  let maximumFeasibleStopCount = 0;
  let bestRouteIds: string[] = [];
  let minimumWaitSeconds = Infinity;
  let maximumRequestedCategoryCount = 0;
  let expandedStates = 0;
  let prunedByHours = 0;
  let prunedByDuration = 0;
  let prunedByMissingEdge = 0;
  let prunedByWait = 0;

  const visit = (state: FeasibilityState): void => {
    input.signal?.throwIfAborted();
    if (state.visits.length >= requestedStopCount || expandedStates >= ROUTE_COMPOSITION_V2_CONFIG.feasibility.maxExpandedStates) {
      return;
    }
    for (const candidate of input.candidates) {
      if (expandedStates >= ROUTE_COMPOSITION_V2_CONFIG.feasibility.maxExpandedStates ||
        (budget && feasibilityBudgetExhausted(budget))) return;
      if (state.used.has(candidate.node.id) || !accommodationAllowed(input, state, candidate.visitRole)) continue;
      if (!canAddDiningCandidate({
        request: input.tripRequest,
        visits: state.visits,
        candidate,
        candidates: input.candidates,
      })) continue;
      if (!fullCatalog && candidate.schedule.mandatoryReservationImpossible) continue;
      if (!fullCatalog && candidate.schedule.status === "unknown" && !input.tripRequest.scheduleIntent && !candidate.locked && state.unknownCount >= 1) continue;
      expandedStates += 1;
      if (budget) budget.remainingStates -= 1;
      const edge = input.matrix.edges[state.currentNodeId]?.[candidate.node.id];
      if (!isUsableTravelEdge(edge)) {
        prunedByMissingEdge += 1;
        continue;
      }
      const appended = appendScheduledVisit({
        candidate, edge, currentTimeMs: state.currentTimeMs,
        serviceDayStartMs: startMs, tripRequest: input.tripRequest,
      });
      if (!appended) {
        const arrivalMs = state.currentTimeMs + edge.durationSeconds * 1_000;
        const earliestPossibleDepartureMs = arrivalMs + candidate.dwellDurationMinutes * 60_000;
        if (earliestPossibleDepartureMs - startMs > constraints.maxDurationMinutes * 60_000) prunedByDuration += 1;
        else prunedByHours += 1;
        continue;
      }
      const visits = [...state.visits, appended.visit];
      const totalWaitSeconds = visits.reduce((sum, item) => sum + item.waitSeconds, 0);
      if (
        appended.visit.waitSeconds > waitLimits.maximumSingleWaitMinutes * 60 ||
        totalWaitSeconds > waitLimits.maximumTotalWaitMinutes * 60
      ) {
        prunedByWait += 1;
        continue;
      }
      const next: FeasibilityState = {
        visits,
        used: new Set([...state.used, candidate.node.id]),
        currentNodeId: candidate.node.id,
        currentTimeMs: appended.visit.departureAtMs,
        unknownCount: state.unknownCount + (candidate.locked ? 0 : appended.unknownIncrement),
      };
      if (canFinish(input, visits)) {
        for (const item of visits) feasibleCandidateIds.add(item.candidate.node.id);
        const covered = new Set(visits
          .filter(({ candidate: item }) => countsForCategoryCoverage(item, fullCatalog))
          .map(({ candidate: item }) => item.category)
          .filter((category) => requestedCategories.has(category))).size;
        if (visits.length > maximumFeasibleStopCount) {
          bestRouteIds = visits.map(item => item.candidate.node.id);
          minimumWaitSeconds = totalWaitSeconds;
          maximumFeasibleStopCount = visits.length;
          maximumRequestedCategoryCount = covered;
        } else if (visits.length === maximumFeasibleStopCount) {
          minimumWaitSeconds = Math.min(minimumWaitSeconds, totalWaitSeconds);
          maximumRequestedCategoryCount = Math.max(maximumRequestedCategoryCount, covered);
        }
      }
      if (candidate.visitRole !== "accommodation") visit(next);
    }
  };

  visit({ visits: [], used: new Set(), currentNodeId: input.departure.id, currentTimeMs: startMs, unknownCount: 0 });

  const limiting = new Set<RouteFeasibilityReasonCodeV2>();
  if (input.candidates.length < requestedStopCount) limiting.add("eligible_candidates_below_requested_stop_count");
  if (maximumFeasibleStopCount < requestedStopCount) {
    if (prunedByHours > 0) limiting.add("operating_hours_limit_stop_count");
    if (prunedByDuration > 0) limiting.add("trip_duration_limits_stop_count");
    if (prunedByMissingEdge > 0) limiting.add("unresolved_travel_edges_limit_stop_count");
    if (prunedByWait > 0) limiting.add("excessive_wait_for_pace");
  }
  const fullCategoryCoverageFeasible = maximumRequestedCategoryCount === requestedCategories.size;
  if (maximumFeasibleStopCount > 0 && !fullCategoryCoverageFeasible) {
    limiting.add("requested_category_coverage_partially_feasible");
  }
  if (maximumFeasibleStopCount === 0) {
    if (input.tripRequest.requiredPlaceIds?.length) limiting.add("selected_place_temporally_or_physically_infeasible");
    limiting.add("no_feasible_route");
    return {
      status: "insufficient_feasible_route", requestedStopCount,
      maximumFeasibleStopCount: 0, targetStopCount: 0,
      maximumRequestedCategoryCount: 0, requiredRequestedCategoryCount: 0,
      fullCategoryCoverageFeasible: false, feasibleCandidateIds: [], limitingReasonCodes: [...limiting].sort(),
    };
  }
  return {
    status: "ready", requestedStopCount, minimumWaitSeconds, bestRouteIds,
    maximumFeasibleStopCount, targetStopCount: Math.min(requestedStopCount, maximumFeasibleStopCount),
    maximumRequestedCategoryCount,
    requiredRequestedCategoryCount: maximumRequestedCategoryCount,
    fullCategoryCoverageFeasible,
    feasibleCandidateIds: [...feasibleCandidateIds].sort(),
    limitingReasonCodes: [...limiting].sort(),
  };
}
