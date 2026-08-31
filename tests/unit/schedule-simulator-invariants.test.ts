import { describe, expect, it } from "vitest";
import {
  appendScheduledVisitTiming,
  tripStartMs,
} from "@/lib/recommendation/optimizer/schedule-simulator";
import type {
  NormalizedVisitSchedule,
  RouteOptimizationTripRequest,
} from "@/lib/recommendation/types/route-optimizer";
import type { TravelMatrixEdge } from "@/lib/travel/types";

function request(
  overrides: Partial<RouteOptimizationTripRequest> = {},
): RouteOptimizationTripRequest {
  return {
    date: "2026-08-31",
    startTime: "09:00",
    timezone: "Asia/Seoul",
    tripType: "day_trip",
    tripPace: "balanced",
    selectedCategories: ["attraction"],
    roundTrip: false,
    durationMinutes: 12 * 60,
    ...overrides,
  };
}

function edge(durationSeconds: number): TravelMatrixEdge {
  return {
    fromId: "from",
    toId: "to",
    distanceMeters: 1_000,
    durationSeconds,
    lowerBoundMeters: 900,
    status: "resolved",
    source: "kakao_directions_live",
    confidence: "validated",
    temporalBasis: "future_departure",
    distanceFetchedAt: null,
    durationFetchedAt: null,
    reasonCodes: [],
  };
}

function knownSchedule(
  startMinutes: number,
  endMinutes: number,
  finalEntryMinutes: number | null = null,
): NormalizedVisitSchedule {
  return {
    status: "known",
    windows: [{ startMinutes, endMinutes, finalEntryMinutes }],
    mandatoryReservationImpossible: false,
    source: "provider_normalized",
    warningCodes: [],
  };
}

function append(input: {
  currentTimeMs: number;
  serviceDayStartMs: number;
  travelSeconds: number;
  dwellMinutes?: number;
  schedule?: NormalizedVisitSchedule;
  tripRequest?: RouteOptimizationTripRequest;
}) {
  return appendScheduledVisitTiming({
    candidate: {
      schedule: input.schedule ?? knownSchedule(8 * 60, 22 * 60),
      dwellDurationMinutes: input.dwellMinutes ?? 30,
    },
    edge: edge(input.travelSeconds),
    currentTimeMs: input.currentTimeMs,
    serviceDayStartMs: input.serviceDayStartMs,
    tripRequest: input.tripRequest ?? request(),
  });
}

function assertTimeline(result: ReturnType<typeof append>) {
  expect(result).not.toBeNull();
  const visit = result!.visit;
  expect(visit.visitStartsAtMs).toBeGreaterThanOrEqual(visit.arrivalAtMs);
  expect(visit.departureAtMs).toBeGreaterThanOrEqual(
    visit.visitStartsAtMs,
  );
  expect(visit.waitSeconds).toBeGreaterThanOrEqual(0);
}

describe("schedule simulator exact-time invariants", () => {
  it.each([1, 14, 21, 35, 51, 59])(
    "preserves an exact arrival containing %i seconds when already open",
    (seconds) => {
      const start = tripStartMs(request());
      const result = append({
        currentTimeMs: start,
        serviceDayStartMs: start,
        travelSeconds: 52 * 60 + seconds,
      });

      assertTimeline(result);
      expect(result!.visit.visitStartsAtMs).toBe(result!.visit.arrivalAtMs);
      expect(result!.visit.waitSeconds).toBe(0);
    },
  );

  it("waits until an exact minute opening without losing arrival seconds", () => {
    const start = tripStartMs(request());
    const result = append({
      currentTimeMs: start,
      serviceDayStartMs: start,
      travelSeconds: 52 * 60 + 21,
      schedule: knownSchedule(10 * 60, 18 * 60),
    });

    assertTimeline(result);
    expect(new Date(result!.visit.arrivalAtMs).toISOString()).toBe(
      "2026-08-31T00:52:21.000Z",
    );
    expect(new Date(result!.visit.visitStartsAtMs).toISOString()).toBe(
      "2026-08-31T01:00:00.000Z",
    );
    expect(result!.visit.waitSeconds).toBe(7 * 60 + 39);
  });

  it("accepts an exact closing boundary and rejects one second beyond it", () => {
    const start = tripStartMs(request());
    expect(
      append({
        currentTimeMs: start,
        serviceDayStartMs: start,
        travelSeconds: 9 * 60 * 60,
        dwellMinutes: 30,
        schedule: knownSchedule(9 * 60, 18 * 60 + 30),
      }),
    ).not.toBeNull();
    expect(
      append({
        currentTimeMs: start,
        serviceDayStartMs: start,
        travelSeconds: 9 * 60 * 60 + 1,
        dwellMinutes: 30,
        schedule: knownSchedule(9 * 60, 18 * 60 + 30),
      }),
    ).toBeNull();
  });

  it("uses the exact maximum-duration boundary", () => {
    const exactRequest = request({ durationMinutes: 60 });
    const start = tripStartMs(exactRequest);
    expect(
      append({
        currentTimeMs: start,
        serviceDayStartMs: start,
        travelSeconds: 30 * 60,
        dwellMinutes: 30,
        tripRequest: exactRequest,
      }),
    ).not.toBeNull();
    expect(
      append({
        currentTimeMs: start,
        serviceDayStartMs: start,
        travelSeconds: 30 * 60 + 1,
        dwellMinutes: 30,
        tripRequest: exactRequest,
      }),
    ).toBeNull();
  });

  it("keeps an exact, non-negative timeline across consecutive stops", () => {
    const start = tripStartMs(request());
    const first = append({
      currentTimeMs: start,
      serviceDayStartMs: start,
      travelSeconds: 12 * 60 + 35,
      dwellMinutes: 25,
    });
    assertTimeline(first);
    const second = append({
      currentTimeMs: first!.visit.departureAtMs,
      serviceDayStartMs: start,
      travelSeconds: 17 * 60 + 51,
      dwellMinutes: 40,
    });
    assertTimeline(second);

    expect(second!.visit.arrivalAtMs).toBe(
      first!.visit.departureAtMs + (17 * 60 + 51) * 1000,
    );
    expect(second!.visit.departureAtMs - start).toBe(
      (12 * 60 + 35 + 25 * 60 + 17 * 60 + 51 + 40 * 60) * 1000,
    );
  });

  it("uses the Korean calendar day after an overnight rollover", () => {
    const overnightRequest = request({
      date: "2026-08-31",
      startTime: "23:50",
      tripType: "overnight",
      durationMinutes: 120,
    });
    const start = tripStartMs(overnightRequest);
    const result = append({
      currentTimeMs: start,
      serviceDayStartMs: start,
      travelSeconds: 15 * 60 + 14,
      dwellMinutes: 30,
      schedule: knownSchedule(0, 2 * 60),
      tripRequest: overnightRequest,
    });

    assertTimeline(result);
    expect(new Date(result!.visit.arrivalAtMs).toISOString()).toBe(
      "2026-08-31T15:05:14.000Z",
    );
    expect(result!.visit.visitStartsAtMs).toBe(result!.visit.arrivalAtMs);
    expect(result!.visit.departureAtMs - start).toBe(
      (15 * 60 + 14 + 30 * 60) * 1000,
    );
  });

  it("keeps displayed ISO values in the same temporal order", () => {
    const start = tripStartMs(request());
    const result = append({
      currentTimeMs: start,
      serviceDayStartMs: start,
      travelSeconds: 52 * 60 + 51,
    });
    assertTimeline(result);

    const arrival = new Date(result!.visit.arrivalAtMs).toISOString();
    const visitStart = new Date(result!.visit.visitStartsAtMs).toISOString();
    const departure = new Date(result!.visit.departureAtMs).toISOString();
    expect(visitStart >= arrival).toBe(true);
    expect(departure >= visitStart).toBe(true);
  });
});
