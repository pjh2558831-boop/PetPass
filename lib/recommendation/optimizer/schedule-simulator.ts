import "server-only";

import { getRouteTripConstraints } from "@/lib/recommendation/optimizer/trip-constraints";
import type {
  RouteOptimizationCandidate,
  RouteOptimizationTripRequest,
  ScheduledRouteVisit,
} from "@/lib/recommendation/types/route-optimizer";
import type { TravelMatrixEdge } from "@/lib/travel/types";

const DAY_MS = 86_400_000;
const KOREA_OFFSET_MS = 9 * 60 * 60 * 1_000;

export function tripStartMs(request: RouteOptimizationTripRequest): number {
  const parsed = Date.parse(`${request.date}T${request.startTime}:00+09:00`);
  if (!Number.isFinite(parsed)) throw new TypeError("Invalid Asia/Seoul trip start.");
  return parsed;
}

export function isUsableTravelEdge(
  edge: TravelMatrixEdge | undefined,
): edge is TravelMatrixEdge & { distanceMeters: number; durationSeconds: number } {
  return Boolean(
    edge &&
      edge.status === "resolved" &&
      edge.distanceMeters !== null &&
      edge.durationSeconds !== null &&
      edge.confidence !== "estimated_only" &&
      edge.source !== "haversine_lower_bound",
  );
}

export function koreaMinuteOfDay(epochMs: number): number {
  const minutes = Math.floor((epochMs + KOREA_OFFSET_MS) / 60_000);
  return ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
}

function koreaStartOfDayMs(epochMs: number): number {
  return Math.floor((epochMs + KOREA_OFFSET_MS) / DAY_MS) * DAY_MS -
    KOREA_OFFSET_MS;
}

export function appendScheduledVisit(input: {
  candidate: RouteOptimizationCandidate;
  edge: TravelMatrixEdge;
  currentTimeMs: number;
  serviceDayStartMs: number;
  tripRequest: RouteOptimizationTripRequest;
}): { visit: ScheduledRouteVisit; unknownIncrement: number } | null {
  const timing = appendScheduledVisitTiming(input);
  if (!timing) return null;
  return {
    unknownIncrement: timing.unknownIncrement,
    visit: {
      candidate: input.candidate,
      ...timing.visit,
    },
  };
}

export function appendScheduledVisitTiming(input: {
  candidate: Pick<RouteOptimizationCandidate, "schedule" | "dwellDurationMinutes">;
  edge: TravelMatrixEdge;
  currentTimeMs: number;
  serviceDayStartMs: number;
  tripRequest: RouteOptimizationTripRequest;
}): {
  visit: Omit<ScheduledRouteVisit, "candidate">;
  unknownIncrement: number;
} | null {
  if (!isUsableTravelEdge(input.edge)) return null;
  const arrivalAtMs = input.currentTimeMs + input.edge.durationSeconds * 1000;
  let visitStartsAtMs = arrivalAtMs;
  let unknownIncrement = 0;
  if (input.candidate.schedule.status === "known") {
    const arrivalDayStartMs = koreaStartOfDayMs(arrivalAtMs);
    const timing = input.candidate.schedule.windows
      .map((window) => {
        const openingAtMs = arrivalDayStartMs + window.startMinutes * 60_000;
        const closingAtMs = arrivalDayStartMs + window.endMinutes * 60_000;
        const exactVisitStartMs = Math.max(arrivalAtMs, openingAtMs);
        const departureAtMs = exactVisitStartMs +
          input.candidate.dwellDurationMinutes * 60_000;
        const finalEntryAtMs = window.finalEntryMinutes === null
          ? null
          : arrivalDayStartMs + window.finalEntryMinutes * 60_000;
        return {
          visitStartsAtMs: exactVisitStartMs,
          departureAtMs,
          feasible:
            (finalEntryAtMs === null || exactVisitStartMs <= finalEntryAtMs) &&
            departureAtMs <= closingAtMs,
        };
      })
      .filter(({ feasible }) => feasible)
      .sort((left, right) => left.visitStartsAtMs - right.visitStartsAtMs)[0];
    if (!timing) return null;
    visitStartsAtMs = timing.visitStartsAtMs;
  } else {
    unknownIncrement = 1;
  }
  const departureAtMs =
    visitStartsAtMs + input.candidate.dwellDurationMinutes * 60_000;
  const constraints = getRouteTripConstraints(input.tripRequest);
  if (departureAtMs - input.serviceDayStartMs > constraints.maxDurationMinutes * 60_000) {
    return null;
  }
  if (departureAtMs >= input.serviceDayStartMs + DAY_MS) return null;
  return {
    unknownIncrement,
    visit: {
      arrivalAtMs,
      visitStartsAtMs,
      departureAtMs,
      travelSeconds: input.edge.durationSeconds,
      travelDistanceMeters: input.edge.distanceMeters,
      waitSeconds: Math.max(0, (visitStartsAtMs - arrivalAtMs) / 1000),
    },
  };
}
