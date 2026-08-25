import "server-only";

import { ROUTE_SOLVER_V1_CONFIG } from "@/lib/recommendation/config/route-solver-v1";
import { getRouteTripConstraints } from "@/lib/recommendation/optimizer/trip-constraints";
import { scoreCompletedRouteV1 } from "@/lib/recommendation/optimizer/route-score";
import {
  appendScheduledVisit,
  isUsableTravelEdge,
  tripStartMs,
} from "@/lib/recommendation/optimizer/schedule-simulator";
import type {
  CompletedRouteCandidate,
  RouteOptimizationCandidate,
  RouteOptimizationInput,
  ScheduledRouteVisit,
} from "@/lib/recommendation/types/route-optimizer";

export type RouteBaselineName =
  | "highest_utility_fastest"
  | "nearest_neighbor"
  | "category_greedy";

function candidateOrder(
  name: RouteBaselineName,
  input: RouteOptimizationInput,
  currentNodeId: string,
  currentTimeMs: number,
  remaining: RouteOptimizationCandidate[],
  visits: ScheduledRouteVisit[],
): RouteOptimizationCandidate[] {
  return [...remaining].sort((left, right) => {
    const leftEdge = input.matrix.edges[currentNodeId]?.[left.node.id];
    const rightEdge = input.matrix.edges[currentNodeId]?.[right.node.id];
    if (name === "nearest_neighbor") {
      const leftDuration = isUsableTravelEdge(leftEdge) ? leftEdge.durationSeconds : Number.POSITIVE_INFINITY;
      const rightDuration = isUsableTravelEdge(rightEdge) ? rightEdge.durationSeconds : Number.POSITIVE_INFINITY;
      return leftDuration - rightDuration || left.node.id.localeCompare(right.node.id);
    }
    if (name === "category_greedy") {
      const covered = new Set(visits.map((visit) => visit.candidate.category));
      const leftCovered = covered.has(left.category) ? 1 : 0;
      const rightCovered = covered.has(right.category) ? 1 : 0;
      const leftDuration = isUsableTravelEdge(leftEdge) ? leftEdge.durationSeconds : Number.POSITIVE_INFINITY;
      const rightDuration = isUsableTravelEdge(rightEdge) ? rightEdge.durationSeconds : Number.POSITIVE_INFINITY;
      return leftCovered - rightCovered || leftDuration - rightDuration ||
        right.placeUtility.total - left.placeUtility.total || left.node.id.localeCompare(right.node.id);
    }
    const leftRepeat = visits.at(-1)?.candidate.category === left.category ? 1 : 0;
    const rightRepeat = visits.at(-1)?.candidate.category === right.category ? 1 : 0;
    return right.placeUtility.total - left.placeUtility.total ||
      leftRepeat - rightRepeat || left.node.id.localeCompare(right.node.id);
  });
}

export function buildGreedyBaselineV1(
  name: RouteBaselineName,
  input: RouteOptimizationInput,
): CompletedRouteCandidate | null {
  const start = tripStartMs(input.tripRequest);
  const pace = getRouteTripConstraints(input.tripRequest);
  const target = pace.targetStops;
  const visits: ScheduledRouteVisit[] = [];
  let currentNodeId = input.departure.id;
  let currentTimeMs = start;
  let unknownCount = 0;
  const reserveAccommodation = input.tripRequest.tripType === "overnight";
  const regularTarget = reserveAccommodation ? target - 1 : target;
  if (name === "highest_utility_fastest") {
    const regular = input.candidates
      .filter((candidate) => candidate.visitRole !== "accommodation")
      .sort(
        (left, right) =>
          right.placeUtility.total - left.placeUtility.total ||
          left.node.id.localeCompare(right.node.id),
      )
      .slice(0, regularTarget);
    const accommodation = reserveAccommodation
      ? input.candidates
          .filter((candidate) => candidate.visitRole === "accommodation")
          .sort(
            (left, right) =>
              right.placeUtility.total - left.placeUtility.total ||
              left.node.id.localeCompare(right.node.id),
          )[0]
      : undefined;
    if (reserveAccommodation && !accommodation) return null;
    const permutations: RouteOptimizationCandidate[][] = [];
    const permute = (
      prefix: RouteOptimizationCandidate[],
      remainingCandidates: RouteOptimizationCandidate[],
    ) => {
      if (remainingCandidates.length === 0) {
        permutations.push(prefix);
        return;
      }
      for (let index = 0; index < remainingCandidates.length; index += 1) {
        permute(
          [...prefix, remainingCandidates[index]],
          [
            ...remainingCandidates.slice(0, index),
            ...remainingCandidates.slice(index + 1),
          ],
        );
      }
    };
    permute([], regular);
    let fastest: CompletedRouteCandidate | null = null;
    for (const permutation of permutations) {
      const order = [...permutation, ...(accommodation ? [accommodation] : [])];
      const orderedVisits: ScheduledRouteVisit[] = [];
      let nodeId = input.departure.id;
      let timeMs = start;
      let unknown = 0;
      let feasible = true;
      for (const routeCandidate of order) {
        if (
          routeCandidate.schedule.status === "unknown" &&
          unknown >= ROUTE_SOLVER_V1_CONFIG.maxUnknownScheduleStops
        ) {
          feasible = false;
          break;
        }
        const travelEdge = input.matrix.edges[nodeId]?.[routeCandidate.node.id];
        if (!travelEdge) {
          feasible = false;
          break;
        }
        const appended = appendScheduledVisit({
          candidate: routeCandidate,
          edge: travelEdge,
          currentTimeMs: timeMs,
          serviceDayStartMs: start,
          tripRequest: input.tripRequest,
        });
        if (!appended) {
          feasible = false;
          break;
        }
        orderedVisits.push(appended.visit);
        unknown += appended.unknownIncrement;
        nodeId = routeCandidate.node.id;
        timeMs = appended.visit.departureAtMs;
      }
      if (!feasible || orderedVisits.length < pace.minStops) continue;
      let fastestReturn: { seconds: number; meters: number } | undefined;
      if (input.tripRequest.roundTrip) {
        const returnEdge = input.matrix.edges[nodeId]?.[input.departure.id];
        if (!isUsableTravelEdge(returnEdge)) continue;
        if (
          timeMs + returnEdge.durationSeconds * 1000 - start >
          pace.maxDurationMinutes * 60_000
        ) continue;
        fastestReturn = {
          seconds: returnEdge.durationSeconds,
          meters: returnEdge.distanceMeters,
        };
      }
      const route = scoreCompletedRouteV1({
        visits: orderedVisits,
        departureId: input.departure.id,
        serviceDayStartMs: start,
        matrix: input.matrix,
        tripRequest: input.tripRequest,
        returnTravel: fastestReturn,
      });
      if (
        !fastest ||
        route.totalDrivingSeconds < fastest.totalDrivingSeconds ||
        (route.totalDrivingSeconds === fastest.totalDrivingSeconds &&
          route.signature.localeCompare(fastest.signature) < 0)
      ) fastest = route;
    }
    return fastest;
  }
  let remaining = input.candidates.filter((candidate) => candidate.visitRole !== "accommodation");
  while (visits.length < regularTarget && remaining.length > 0) {
    let selected: { candidate: RouteOptimizationCandidate; visit: ScheduledRouteVisit; unknown: number } | null = null;
    for (const candidate of candidateOrder(name, input, currentNodeId, currentTimeMs, remaining, visits)) {
      if (candidate.schedule.status === "unknown" && unknownCount >= ROUTE_SOLVER_V1_CONFIG.maxUnknownScheduleStops) continue;
      const edge = input.matrix.edges[currentNodeId]?.[candidate.node.id];
      if (!edge) continue;
      const appended = appendScheduledVisit({
        candidate,
        edge,
        currentTimeMs,
        serviceDayStartMs: start,
        tripRequest: input.tripRequest,
      });
      if (!appended) continue;
      selected = { candidate, visit: appended.visit, unknown: appended.unknownIncrement };
      break;
    }
    if (!selected) break;
    visits.push(selected.visit);
    unknownCount += selected.unknown;
    currentNodeId = selected.candidate.node.id;
    currentTimeMs = selected.visit.departureAtMs;
    remaining = remaining.filter((candidate) => candidate.node.id !== selected!.candidate.node.id);
  }
  if (reserveAccommodation) {
    const accommodations = candidateOrder(
      name,
      input,
      currentNodeId,
      currentTimeMs,
      input.candidates.filter((candidate) => candidate.visitRole === "accommodation"),
      visits,
    );
    for (const candidate of accommodations) {
      if (candidate.schedule.status === "unknown" && unknownCount >= ROUTE_SOLVER_V1_CONFIG.maxUnknownScheduleStops) continue;
      const edge = input.matrix.edges[currentNodeId]?.[candidate.node.id];
      if (!edge) continue;
      const appended = appendScheduledVisit({ candidate, edge, currentTimeMs, serviceDayStartMs: start, tripRequest: input.tripRequest });
      if (!appended) continue;
      visits.push(appended.visit);
      currentNodeId = candidate.node.id;
      currentTimeMs = appended.visit.departureAtMs;
      break;
    }
  }
  if (visits.length < pace.minStops || (reserveAccommodation && visits.at(-1)?.candidate.visitRole !== "accommodation")) return null;
  let returnTravel: { seconds: number; meters: number } | undefined;
  if (input.tripRequest.roundTrip) {
    const edge = input.matrix.edges[currentNodeId]?.[input.departure.id];
    if (!isUsableTravelEdge(edge)) return null;
    returnTravel = { seconds: edge.durationSeconds, meters: edge.distanceMeters };
  }
  return scoreCompletedRouteV1({
    visits,
    departureId: input.departure.id,
    serviceDayStartMs: start,
    matrix: input.matrix,
    tripRequest: input.tripRequest,
    returnTravel,
  });
}

export function buildAllGreedyBaselinesV1(input: RouteOptimizationInput) {
  return (["nearest_neighbor", "highest_utility_fastest", "category_greedy"] as const).map(
    (name) => ({ name, route: buildGreedyBaselineV1(name, input) }),
  );
}
