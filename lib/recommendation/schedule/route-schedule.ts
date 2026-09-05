import type { ProductRouteV1 } from "@/types/recommendation";
import type { ScheduleIntent } from "@/types/schedule";

export function attachRouteSchedule(route: ProductRouteV1, requested: ScheduleIntent, effectiveTime: string): ProductRouteV1 {
  const start = Date.parse(route.routeSummary.startAt!);
  const offset = (value: string | null) => value ? Math.max(0, Math.round((Date.parse(value) - start) / 1000)) : 0;
  const undated = requested.date === null;
  const adjusted = requested.startTime !== null && requested.startTime !== effectiveTime;
  const broadPlanning = route.planningPolicy === "full_public_catalog_v1";
  return {
    ...route,
    schedule: {
      requested, effective: { date: requested.date, startTime: effectiveTime },
      state: adjusted ? "adjustment_proposal" : undated ? "undated_template" : "scheduled",
      timingBasis: undated ? requested.startTime ? "illustrative_clock" : "relative" : "dated",
      roadValidated: true, timeBudgetValidated: true,
      calendarValidation: broadPlanning ? "unchecked" : undated ? "date_required" : "checked_known_rules",
      operatingAvailability: broadPlanning ? "unchecked" : route.stops.some(stop => stop.operatingHoursEvidenceState !== "verified") ? "requires_confirmation" : "known_rules_checked",
      reasonCodes: [...(undated ? ["travel_date_not_selected"] : []), ...(adjusted ? ["departure_time_adjustment_proposed"] : []), ...(requested.startTime === null ? ["departure_time_recommended"] : []), ...(broadPlanning ? ["venue_compatibility_unchecked"] : [])],
    },
    routeSummary: { ...route.routeSummary, startAt: undated ? null : route.routeSummary.startAt, endAt: undated ? null : route.routeSummary.endAt, totalElapsedSeconds: offset(route.routeSummary.endAt) },
    estimatedFinishAt: undated ? null : route.estimatedFinishAt,
    stops: route.stops.map(stop => ({ ...stop, arrivalOffsetSeconds: offset(stop.arrivalAt), visitStartsOffsetSeconds: offset(stop.visitStartsAt), departureOffsetSeconds: offset(stop.departureAt), arrivalAt: undated ? null : stop.arrivalAt, visitStartsAt: undated ? null : stop.visitStartsAt, departureAt: undated ? null : stop.departureAt })),
  };
}
