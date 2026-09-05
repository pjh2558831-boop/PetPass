import { expect, it } from "vitest";
import { createApprovedManualEditSession, createEditSessionId, createManualConfirmationEditSession, parseEditSession } from "@/lib/recommendation/edit-session";
import type { RouteOptimizationInput } from "@/lib/recommendation/types/route-optimizer";

const secret = "unit-test-route-edit-session-secret";

function input(): RouteOptimizationInput {
  return {
    departure: { id: "departure", kind: "departure", name: "출발", latitude: 35, longitude: 129 },
    candidates: [{
      node: { id: "tour:1", kind: "place", name: "장소", latitude: 35.1, longitude: 129.1 },
      place: {} as never,
      placeUtility: {} as never,
      dwellDurationMinutes: 60,
      dwellDurationSource: "category_default",
      schedule: { status: "unknown", windows: [], mandatoryReservationImpossible: false, source: "stage2_unknown", warningCodes: [] },
      category: "attraction", visitRole: "activity", highActivity: false,
      popularity: {} as never, informationTrust: {} as never,
      exposure: { version: "exposure-v1", status: "not_available", score: null },
      source: "tourism_service2", petAssessment: "allowed", evidenceStatus: "verified", eligibilityTier: "verified",
    }],
    matrix: { version: "travel-matrix-v1", nodeIds: [], edges: {}, complete: true, diagnostics: {} as never },
    tripRequest: { date: "2000-01-01", startTime: "09:00", scheduleIntent: { date: null, startTime: null }, timezone: "Asia/Seoul", tripType: "day_trip", tripPace: "balanced", selectedCategories: ["attraction"], roundTrip: false },
  };
}

it("round-trips broad planning and negative catalog evidence through the signed session", () => {
  const broad = input();
  broad.tripRequest.planningPolicy = "full_public_catalog_v1";
  broad.candidates[0] = { ...broad.candidates[0]!, planningPolicy: "full_public_catalog_v1", petAssessment: "not_allowed", category: "unknown" };
  const stop = {
    placeId: "tour:1", sequence: 1, title: "장소", address: null,
    coordinates: { latitude: 35.1, longitude: 129.1 }, category: "unknown",
    arrivalAt: null, visitStartsAt: null, departureAt: null, dwellMinutes: 60,
    driveSecondsFromPrevious: 0, distanceMetersFromPrevious: 0,
    source: "tourism_service2", sourceLabel: "한국관광공사", petAssessment: "not_allowed",
    operatingStatus: "unknown", mandatoryConditions: [], informationTrust: "low",
    licensingStatus: "not_applicable", operatingHoursWarnings: ["operating_hours_unknown"],
    inclusionReasonCodes: ["full_public_catalog_candidate"], orderingReasonCodes: [], warningCodes: ["pet_access_not_allowed"], evidence: [],
    catalogEvidence: [{ provider: "kto", providerPlaceId: "1", petAssessment: "not_allowed", originalText: "동반 불가", retrievedAt: "2026-09-05T00:00:00.000Z", publicLabel: "한국관광공사" }],
  } as const;
  const route = { planningPolicy: "full_public_catalog_v1", venueCompatibility: "unchecked", id: "route", kind: "optimized", label: "route", routeSummary: { startAt: null, endAt: null, stopCount: 1, totalDistanceMeters: 0, totalDrivingSeconds: 0, totalVisitSeconds: 3600, totalWaitSeconds: 0 }, temporalBasis: { searchMatrix: "unknown", finalRoute: "unknown" }, stops: [stop], geometry: [] } as never;
  const parsed = parseEditSession(createEditSessionId(broad, [route], "unknown", 1_000, secret), 1_001, secret)!;
  expect(parsed.tripRequest.planningPolicy).toBe("full_public_catalog_v1");
  expect(parsed.candidates[0]).toMatchObject({ planningPolicy: "full_public_catalog_v1", originalStop: { petAssessment: "not_allowed", category: "unknown", catalogEvidence: [{ originalText: "동반 불가" }] } });
});

it("stores null on the wire for an undated session and reconstructs its private arithmetic date", () => {
  const route = { id: "route", kind: "optimized", label: "route", routeSummary: { startAt: null, endAt: null, stopCount: 1, totalDistanceMeters: 0, totalDrivingSeconds: 0, totalVisitSeconds: 3600, totalWaitSeconds: 0 }, temporalBasis: { searchMatrix: "unknown", finalRoute: "unknown" }, stops: [{ placeId: "tour:1" }], geometry: [] } as never;
  const token = createEditSessionId(input(), [route], "unknown", 1_000, secret);
  const wire = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"));
  expect(wire.tripRequest.date).toBeNull();
  const session = parseEditSession(token, 1_001, secret)!;
  expect(session.tripRequest.date).toBe("2000-01-01");
  const confirmation = createManualConfirmationEditSession(session, ["tour:1"], ["q1"], [], secret);
  const approved = createApprovedManualEditSession(session, route, secret);
  for (const value of [confirmation, approved]) {
    const payload = JSON.parse(Buffer.from(value.split(".")[1]!, "base64url").toString("utf8"));
    expect(payload.tripRequest.date).toBeNull();
  }
});
