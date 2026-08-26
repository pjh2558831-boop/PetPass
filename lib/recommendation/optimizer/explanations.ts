import "server-only";

import { ROUTE_SOLVER_V1_CONFIG } from "@/lib/recommendation/config/route-solver-v1";
import { getRouteTripConstraints } from "@/lib/recommendation/optimizer/trip-constraints";
import { isUsableTravelEdge } from "@/lib/recommendation/optimizer/schedule-simulator";
import type {
  CompletedRouteCandidate,
  ExcludedPlaceExplanation,
  RecommendedRouteStop,
  RouteOptimizationInput,
} from "@/lib/recommendation/types/route-optimizer";

export function explainStops(
  route: CompletedRouteCandidate,
  selectedCategories: readonly string[],
): RecommendedRouteStop[] {
  return route.visits.map((visit, index) => {
    const inclusion = [
      "matches_pet_profile",
      "official_pet_evidence",
      "strict_automatic_route_eligibility",
      "stage2_place_utility",
      "fits_trip_pace",
    ];
    if (selectedCategories.includes(visit.candidate.category)) {
      inclusion.push("matches_requested_category");
    }
    if (visit.candidate.informationTrust.score >= 70) {
      inclusion.push("high_information_trust");
    }
    if (route.popularAnchorPlaceId === visit.candidate.node.id) inclusion.push("popular_anchor");
    if (route.explorationPlaceId === visit.candidate.node.id) inclusion.push("low_exposure_exploration");
    const ordering = ["route_objective_order"];
    if (visit.candidate.schedule.status === "known") {
      ordering.push("fits_operating_window");
    }
    const previous = route.visits[index - 1];
    if (previous) {
      const transition = `transition_${previous.candidate.visitRole}_to_${visit.candidate.visitRole}`;
      if (route.transitionReasonCodes.includes(transition)) ordering.push(transition);
    }
    if (visit.candidate.visitRole === "meal") {
      const mealIndex = route.visits
        .slice(0, index + 1)
        .filter((item) => item.candidate.visitRole === "meal").length - 1;
      ordering.push(route.mealReasonCodes[mealIndex] ?? "meal_schedule_considered");
    }
    if (
      previous?.candidate.highActivity &&
      ["rest", "meal"].includes(visit.candidate.visitRole)
    ) {
      ordering.push("rest_after_high_activity");
    }
    if (visit.candidate.visitRole === "accommodation") ordering.push("overnight_final_accommodation");
    return {
      placeId: visit.candidate.node.id,
      sequence: index + 1,
      arrivalAt: new Date(visit.arrivalAtMs).toISOString(),
      visitStartsAt: new Date(visit.visitStartsAtMs).toISOString(),
      departureAt: new Date(visit.departureAtMs).toISOString(),
      dwellMinutes: visit.candidate.dwellDurationMinutes,
      driveSecondsFromPrevious: visit.travelSeconds,
      distanceMetersFromPrevious: visit.travelDistanceMeters,
      waitSeconds: visit.waitSeconds,
      dwellDurationSource: visit.candidate.dwellDurationSource,
      source: visit.candidate.source ?? "tourism_service2",
      petAssessment:
        visit.candidate.petAssessment ??
        (visit.candidate.place?.assessment.verdict === "not_allowed"
          ? "unknown"
          : visit.candidate.place?.assessment.verdict) ??
        "unknown",
      evidenceStatus:
        visit.candidate.evidenceStatus ??
        (visit.candidate.place?.assessment.verdict === "allowed" ? "verified" : "conditional"),
      informationTrust: visit.candidate.informationTrust.level,
      placeUtility: visit.candidate.placeUtility,
      inclusionReasonCodes: inclusion,
      orderingReasonCodes: ordering,
      warningCodes: [
        ...new Set([
          ...visit.candidate.schedule.warningCodes,
          ...visit.candidate.placeUtility.warningCodes,
          ...(visit.candidate.dwellDurationSource === "category_default"
            ? ["default_dwell_duration_used"]
            : []),
          ...((visit.candidate.petAssessment ?? visit.candidate.place?.assessment.verdict) === "conditional"
            ? ["conditional_pet_requirement"]
            : []),
        ]),
      ].sort(),
    };
  });
}

export function explainExcludedPlaces(input: {
  optimization: RouteOptimizationInput;
  selected: CompletedRouteCandidate;
}): ExcludedPlaceExplanation[] {
  const selectedIds = new Set(input.selected.orderedPlaceIds);
  return input.optimization.candidates
    .filter((candidate) => !selectedIds.has(candidate.node.id))
    .map((candidate): ExcludedPlaceExplanation => {
      let reasonCode: ExcludedPlaceExplanation["reasonCode"] = "lower_total_route_score";
      const anyIncoming = [input.optimization.departure.id, ...input.selected.orderedPlaceIds].some(
        (from) => isUsableTravelEdge(input.optimization.matrix.edges[from]?.[candidate.node.id]),
      );
      if (!anyIncoming) reasonCode = "unresolved_travel_edge";
      else if (candidate.schedule.mandatoryReservationImpossible) reasonCode = "time_window_conflict";
      else if (candidate.visitRole === "accommodation" && input.optimization.tripRequest.tripType === "day_trip") {
        reasonCode = "accommodation_position_rule";
      } else if (input.selected.visits.length >= getRouteTripConstraints(input.optimization.tripRequest).maxStops) {
        reasonCode = "pace_limit";
      }
      return { placeId: candidate.node.id, reasonCode, placeUtility: candidate.placeUtility.total };
    })
    .sort((left, right) => right.placeUtility - left.placeUtility || left.placeId.localeCompare(right.placeId))
    .slice(0, ROUTE_SOLVER_V1_CONFIG.maxExcludedHighlights);
}
