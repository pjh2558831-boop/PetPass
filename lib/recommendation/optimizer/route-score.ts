import "server-only";

import { categoryTransitionBonusV1 } from "@/lib/recommendation/config/category-transition-v1";
import { MEAL_WINDOWS_V1_CONFIG } from "@/lib/recommendation/config/meal-windows-v1";
import { ROUTE_OBJECTIVE_V1_CONFIG } from "@/lib/recommendation/config/route-objective-v1";
import { getRouteTripConstraints } from "@/lib/recommendation/optimizer/trip-constraints";
import {
  isUsableTravelEdge,
  koreaMinuteOfDay,
} from "@/lib/recommendation/optimizer/schedule-simulator";
import type {
  CompletedRouteCandidate,
  RouteOptimizationTripRequest,
  RouteScoreBreakdown,
  ScheduledRouteVisit,
} from "@/lib/recommendation/types/route-optimizer";
import type { TravelMatrixResult } from "@/lib/travel/types";

function routeTravel(input: {
  ids: readonly string[];
  departureId: string;
  matrix: TravelMatrixResult;
  roundTrip: boolean;
}): { seconds: number; meters: number } | null {
  let seconds = 0;
  let meters = 0;
  let from = input.departureId;
  for (const to of input.ids) {
    const edge = input.matrix.edges[from]?.[to];
    if (!isUsableTravelEdge(edge)) return null;
    seconds += edge.durationSeconds;
    meters += edge.distanceMeters;
    from = to;
  }
  if (input.roundTrip) {
    const edge = input.matrix.edges[from]?.[input.departureId];
    if (!isUsableTravelEdge(edge)) return null;
    seconds += edge.durationSeconds;
    meters += edge.distanceMeters;
  }
  return { seconds, meters };
}

export function fastestTravelForSelectedSet(input: {
  selectedIds: readonly string[];
  departureId: string;
  matrix: TravelMatrixResult;
  roundTrip: boolean;
}): number {
  let best = Number.POSITIVE_INFINITY;
  const remaining = [...input.selectedIds].sort();
  const visit = (prefix: string[], rest: string[]) => {
    if (rest.length === 0) {
      const travel = routeTravel({
        ids: prefix,
        departureId: input.departureId,
        matrix: input.matrix,
        roundTrip: input.roundTrip,
      });
      if (travel) best = Math.min(best, travel.seconds);
      return;
    }
    for (let index = 0; index < rest.length; index += 1) {
      visit(
        [...prefix, rest[index]],
        [...rest.slice(0, index), ...rest.slice(index + 1)],
      );
    }
  };
  visit([], remaining);
  return best;
}

function overlapMinutes(
  startMinute: number,
  endMinute: number,
  window: { startMinutes: number; endMinutes: number },
): number {
  return Math.max(
    0,
    Math.min(endMinute, window.endMinutes) - Math.max(startMinute, window.startMinutes),
  );
}

export function scoreCompletedRouteV1(input: {
  visits: ScheduledRouteVisit[];
  departureId: string;
  serviceDayStartMs: number;
  matrix: TravelMatrixResult;
  tripRequest: RouteOptimizationTripRequest;
  returnTravel?: { seconds: number; meters: number };
  fastestTravelCache?: Map<string, number>;
}): CompletedRouteCandidate {
  const { visits } = input;
  const cfg = ROUTE_OBJECTIVE_V1_CONFIG;
  const pace = getRouteTripConstraints(input.tripRequest);
  const orderedPlaceIds = visits.map((visit) => visit.candidate.node.id);
  const baseDrivingSeconds = visits.reduce((sum, visit) => sum + visit.travelSeconds, 0);
  const baseDistanceMeters = visits.reduce(
    (sum, visit) => sum + visit.travelDistanceMeters,
    0,
  );
  const totalDrivingSeconds = baseDrivingSeconds + (input.returnTravel?.seconds ?? 0);
  const totalDistanceMeters = baseDistanceMeters + (input.returnTravel?.meters ?? 0);
  const totalVisitSeconds = visits.reduce(
    (sum, visit) => sum + visit.candidate.dwellDurationMinutes * 60,
    0,
  );
  const totalWaitSeconds = visits.reduce((sum, visit) => sum + visit.waitSeconds, 0);

  const discountedPlaceUtility = visits.reduce(
    (sum, visit, index) =>
      sum + Math.round(visit.candidate.placeUtility.total * cfg.positionDiscount[index]),
    0,
  );
  const requestedCategories = new Set(input.tripRequest.selectedCategories);
  const distinctCategories = new Set(
    visits
      .map((visit) => visit.candidate.category)
      .filter((category) => requestedCategories.has(category)),
  );
  const categoryCoverageBonus = Math.min(
    cfg.categoryCoverageMaximum,
    distinctCategories.size * cfg.categoryCoveragePerCategory,
  );
  let categoryTransitionBonus = 0;
  const transitionReasonCodes: string[] = [];
  for (let index = 1; index < visits.length; index += 1) {
    const transition = categoryTransitionBonusV1(
      visits[index - 1].candidate.visitRole,
      visits[index].candidate.visitRole,
      {
        overnight: input.tripRequest.tripType === "overnight",
        toIsFinal: index === visits.length - 1,
      },
    );
    categoryTransitionBonus += transition.bonus;
    if (transition.reasonCode) transitionReasonCodes.push(transition.reasonCode);
  }

  let mealAlignmentBonus = 0;
  const mealReasonCodes: string[] = [];
  for (const visit of visits.filter((item) => item.candidate.visitRole === "meal")) {
    const start = koreaMinuteOfDay(visit.visitStartsAtMs);
    const end = koreaMinuteOfDay(visit.departureAtMs);
    const aligned = MEAL_WINDOWS_V1_CONFIG.windows.some(
      (window) => overlapMinutes(start, end, window) >= cfg.minimumMealWindowOverlapMinutes,
    );
    mealAlignmentBonus += aligned ? cfg.mealAlignmentBonus : -cfg.mealOutsideWindowPenalty;
    mealReasonCodes.push(aligned ? "meal_window_aligned" : "meal_outside_window");
  }

  let restAfterActivityBonus = 0;
  for (let index = 1; index < visits.length; index += 1) {
    if (
      visits[index - 1].candidate.highActivity &&
      ["rest", "meal"].includes(visits[index].candidate.visitRole)
    ) {
      restAfterActivityBonus += cfg.restAfterActivityBonus;
    }
  }
  const last = visits.at(-1);
  const accommodationPlacementBonus =
    input.tripRequest.tripType === "overnight" && last?.candidate.visitRole === "accommodation"
      ? cfg.accommodationFinalBonus
      : 0;
  const popular = visits.find(
    (visit) =>
      visit.candidate.popularity.status === "sufficient_data" &&
      visit.candidate.popularity.score >= cfg.popularAnchorThreshold,
  );
  const popularAnchorBonus = popular ? cfg.popularAnchorBonus : 0;
  const exploration = visits.find(
    (visit) =>
      visit.candidate.exposure.status === "sufficient_data" &&
      visit.candidate.exposure.score !== null &&
      visit.candidate.exposure.score <= cfg.explorationMaximumExposure &&
      visit.candidate.placeUtility.preferenceFit >= cfg.explorationMinimumPreferenceFit &&
      visit.candidate.informationTrust.score >= cfg.explorationMinimumTrustScore,
  );
  const explorationBonus = exploration ? cfg.explorationBonus : 0;
  const drivingTimePenalty = Math.round((totalDrivingSeconds / 60) * cfg.drivingPenaltyPerMinute);
  const waitingPenalty = Math.round(
    (Math.max(0, totalWaitSeconds / 60 - cfg.waitingFreeMinutes)) *
      cfg.waitingPenaltyPerMinute,
  );
  let repeatedCategoryPenalty = 0;
  const categoryFrequency = new Map<string, number>();
  for (const { candidate } of visits) {
    const count = (categoryFrequency.get(candidate.category) ?? 0) + 1;
    categoryFrequency.set(candidate.category, count);
    if (count === 2) repeatedCategoryPenalty += cfg.secondCategoryVisitPenalty;
    if (count > 2) repeatedCategoryPenalty += cfg.additionalCategoryVisitPenalty;
  }
  for (let index = 1; index < visits.length; index += 1) {
    if (visits[index - 1].candidate.category === visits[index].candidate.category) {
      repeatedCategoryPenalty += cfg.consecutiveCategoryPenalty;
    }
  }
  const travelCacheKey = `${input.departureId}|${input.tripRequest.roundTrip ? "round" : "open"}|${[...orderedPlaceIds].sort().join(",")}`;
  let fastestDrivingSecondsForSelectedSet = input.fastestTravelCache?.get(travelCacheKey);
  if (fastestDrivingSecondsForSelectedSet === undefined) {
    fastestDrivingSecondsForSelectedSet = fastestTravelForSelectedSet({
      selectedIds: orderedPlaceIds,
      departureId: input.departureId,
      matrix: input.matrix,
      roundTrip: input.tripRequest.roundTrip,
    });
    input.fastestTravelCache?.set(travelCacheKey, fastestDrivingSecondsForSelectedSet);
  }
  const detourRatio =
    Number.isFinite(fastestDrivingSecondsForSelectedSet) &&
    fastestDrivingSecondsForSelectedSet > 0
      ? totalDrivingSeconds / fastestDrivingSecondsForSelectedSet
      : 1;
  const detourPenalty = Math.round(
    Math.min(
      cfg.detourPenaltyMaximum,
      Math.max(0, detourRatio - cfg.detourFreeRatio) * cfg.detourPenaltyScale,
    ),
  );
  const unknownScheduleCount = visits.filter(
    (visit) => visit.candidate.schedule.status === "unknown",
  ).length;
  const unknownSchedulePenalty = unknownScheduleCount * cfg.unknownSchedulePenalty;
  const paceDeviationPenalty =
    Math.abs(visits.length - pace.targetStops) * cfg.paceDeviationPenaltyPerStop;
  const scoreBreakdown: RouteScoreBreakdown = {
    version: "route-objective-v1",
    discountedPlaceUtility,
    categoryCoverageBonus,
    categoryTransitionBonus,
    mealAlignmentBonus,
    restAfterActivityBonus,
    accommodationPlacementBonus,
    popularAnchorBonus,
    explorationBonus,
    drivingTimePenalty,
    waitingPenalty,
    repeatedCategoryPenalty,
    detourPenalty,
    unknownSchedulePenalty,
    paceDeviationPenalty,
    total: 0,
  };
  scoreBreakdown.total =
    discountedPlaceUtility +
      categoryCoverageBonus +
      categoryTransitionBonus +
      mealAlignmentBonus +
      restAfterActivityBonus +
      accommodationPlacementBonus +
      popularAnchorBonus +
      explorationBonus -
      drivingTimePenalty -
      waitingPenalty -
      repeatedCategoryPenalty -
      detourPenalty -
      unknownSchedulePenalty -
      paceDeviationPenalty;
  const warningCodes = [
    ...new Set(
      visits.flatMap((visit) =>
        visit.candidate.schedule.status === "unknown"
          ? visit.candidate.schedule.warningCodes
          : [],
      ),
    ),
  ].sort();
  const currentTimeEpochMs =
    (last?.departureAtMs ?? input.serviceDayStartMs) +
    (input.returnTravel?.seconds ?? 0) * 1000;
  return {
    orderedPlaceIds,
    currentNodeId: input.tripRequest.roundTrip
      ? input.departureId
      : (last?.candidate.node.id ?? input.departureId),
    currentTimeEpochMs,
    totalDrivingSeconds,
    totalVisitSeconds,
    totalWaitSeconds,
    totalDistanceMeters,
    visitedCategories: visits.map((visit) => visit.candidate.category),
    visitedRoles: visits.map((visit) => visit.candidate.visitRole),
    unknownScheduleCount,
    popularAnchorCount: popular ? 1 : 0,
    explorationCandidateCount: exploration ? 1 : 0,
    score: scoreBreakdown.total,
    scoreBreakdown,
    warningCodes,
    visits,
    signature: orderedPlaceIds.join(">"),
    detourRatio: Math.round(detourRatio * 1_000_000) / 1_000_000,
    fastestDrivingSecondsForSelectedSet,
    informationTrustSum: visits.reduce(
      (sum, visit) => sum + visit.candidate.informationTrust.score,
      0,
    ),
    transitionReasonCodes,
    mealReasonCodes,
    popularAnchorPlaceId: popular?.candidate.node.id ?? null,
    explorationPlaceId: exploration?.candidate.node.id ?? null,
  };
}

export function compareCompletedRoutes(
  left: CompletedRouteCandidate,
  right: CompletedRouteCandidate,
): number {
  return (
    right.score - left.score ||
    left.warningCodes.length - right.warningCodes.length ||
    left.totalDrivingSeconds - right.totalDrivingSeconds ||
    left.totalWaitSeconds - right.totalWaitSeconds ||
    right.informationTrustSum - left.informationTrustSum ||
    left.signature.localeCompare(right.signature)
  );
}
