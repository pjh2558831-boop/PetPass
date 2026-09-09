import { expect, test } from "@playwright/test";
import type { ProductRouteV1 } from "@/types/recommendation";
import { futureTripDate } from "./planner-test-helpers";

function baseRequest() {
  return {
    departure: {
      label: "부산역",
      latitude: 35.115,
      longitude: 129.04,
      source: "kakao_place_search",
    },
    trip: {
      regionId: "busan",
      districtId: null,
      date: futureTripDate(),
      startTime: "10:00",
      tripType: "day_trip",
      tripPace: "balanced",
      selectedCategories: ["attraction", "food", "leisure"],
      roundTrip: false,
    },
    pet: {
      name: "보리",
      species: "DOG",
      size: "SMALL",
      availableEquipment: { carrier: true, leash: true, muzzle: false },
      acceptsOutdoorOnlyPlaces: true,
    },
  };
}

function expectRoadAndTimeAccounting(route: ProductRouteV1) {
  const segments = route.segments!;
  expect(segments).toHaveLength(route.stops.length);
  expect(new Set(route.stops.map(stop => stop.placeId)).size).toBe(route.stops.length);
  for (const [index, stop] of route.stops.entries()) {
    expect(segments[index]).toMatchObject({
      fromPlaceId: index === 0 ? "departure" : route.stops[index - 1]!.placeId,
      toPlaceId: stop.placeId,
      travelSeconds: stop.driveSecondsFromPrevious,
      distanceMeters: stop.distanceMetersFromPrevious,
    });
    expect(segments[index]!.travelSeconds).toBeGreaterThanOrEqual(0);
    expect(stop.dwellMinutes).toBeGreaterThan(0);
  }
  const summary = route.routeSummary;
  expect(summary.stopCount).toBe(route.stops.length);
  expect(segments.reduce((sum, edge) => sum + edge.travelSeconds, 0)).toBe(summary.totalDrivingSeconds);
  expect(segments.reduce((sum, edge) => sum + edge.distanceMeters, 0)).toBe(summary.totalDistanceMeters);
  expect(route.stops.reduce((sum, stop) => sum + stop.dwellMinutes * 60, 0)).toBe(summary.totalVisitSeconds);
  const elapsed = summary.totalDrivingSeconds + summary.totalVisitSeconds + summary.totalWaitSeconds;
  if (summary.startAt && summary.endAt) {
    expect((Date.parse(summary.endAt) - Date.parse(summary.startAt)) / 1_000).toBe(elapsed);
  } else {
    expect(route.stops.at(-1)!.departureOffsetSeconds).toBe(elapsed);
  }
}

test("returns a road-validated public-catalog route with truthful provider evidence", async ({
  request,
}) => {
  const response = await request.post("/api/itineraries/generate", {
    data: baseRequest(),
    headers: { "x-forwarded-for": "stage5-product-route" },
  });
  const body = await response.json();
  expect(response.status(), body.status).toBe(200);
  expect(body).toMatchObject({
    status: "ready",
    apiVersion: "route-recommendation-response-v1",
    optimality: "optimal_within_candidate_set_current_matrix",
    route: {
      planningPolicy: "full_public_catalog_v1",
      venueCompatibility: "unchecked",
      kind: "optimized",
      routeSummary: { stopCount: 3 },
      temporalBasis: {
        searchMatrix: "traffic_independent",
        finalRoute: "future_departure",
      },
    },
  });
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain("serviceKey");
  expect(serialized).not.toContain("Authorization");
  expect(body.route.stops).toHaveLength(3);
  expectRoadAndTimeAccounting(body.route);
  expect(body.route.stops).toEqual(expect.arrayContaining([expect.objectContaining({
    placeId: "kakao:90001",
    petAssessment: "allowed",
    evidenceStatus: "verified",
    catalogEvidence: [expect.objectContaining({ provider: "kakao", providerPlaceId: "90001", petAssessment: "unknown", originalText: null })],
  })]));
  for (const stop of body.route.stops as ProductRouteV1["stops"]) {
    expect(stop.placeId).toMatch(/^(tour|kakao):/u);
    expect(stop.catalogEvidence?.length).toBeGreaterThan(0);
    expect(stop.catalogEvidence).toEqual(expect.arrayContaining([expect.objectContaining({
      provider: stop.source === "tourism_service2" ? "kto" : "kakao",
    })]));
    expect(stop.conditionAcknowledged).not.toBe(true);
    if (stop.source === "kakao_catalog") {
      // Registered-place route eligibility is normalized; source evidence is not.
      expect(stop.petAssessment).toBe("allowed");
      expect(stop.evidenceStatus).toBe("verified");
      expect(stop.catalogEvidence).toEqual(expect.arrayContaining([expect.objectContaining({
        provider: "kakao", petAssessment: "unknown", originalText: null,
      })]));
      expect(stop.informationTrust).toBe("low");
    }
  }
  expect(body.route.geometry.length).toBeGreaterThan(1);
  expect(body).not.toHaveProperty("itineraries");
  expect(body).not.toHaveProperty("limits");
});

test("rejects legacy parameters, arbitrary provider URLs, and client-owned limits", async ({
  request,
}) => {
  for (const body of [
    {
      ...baseRequest(),
      planning: { desiredStopCount: 5 },
    },
    {
      ...baseRequest(),
      providerUrl: "https://example.invalid/upstream",
    },
    {
      ...baseRequest(),
      maxCandidates: 999,
    },
  ]) {
    const response = await request.post("/api/itineraries/generate", {
      data: body,
      headers: { "x-forwarded-for": `stage5-invalid-${Math.random()}` },
    });
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      status: "invalid_request",
      retryable: false,
    });
  }
});

for (const mode of [
  { name: "undated", date: null, startTime: null },
  { name: "date only", date: futureTripDate(), startTime: null },
  { name: "time only", date: null, startTime: "10:00" },
  { name: "dated fixed", date: futureTripDate(), startTime: "10:00" },
]) {
  test(`normalizes and computes the V2 ${mode.name} schedule through the real HTTP handler with mock providers`, async ({ request }, testInfo) => {
    const original = baseRequest();
    const response = await request.post("/api/itineraries/generate", {
      data: { ...original, requestVersion: 2, trip: { ...original.trip, date: mode.date, startTime: mode.startTime }, pet: { name: "보리", species: "DOG", size: "SMALL" } },
      headers: { "x-forwarded-for": `completion-http-${mode.name}-${testInfo.project.name}` },
    });
    const body = await response.json();
    expect(response.status(), body.status).toBe(200);
    expect(body.apiVersion).toBe("route-recommendation-response-v2");
    expect(body.route.schedule.requested).toEqual({ date: mode.date, startTime: mode.startTime });
    expect(body.route.schedule.roadValidated).toBe(true);
    expect(body.route.schedule.calendarValidation).toBe("unchecked");
    expect(body.route.schedule.operatingAvailability).toBe("unchecked");
    expectRoadAndTimeAccounting(body.route);
    expect(body.route.venueCompatibility).toBe("unchecked");
    expect(body.route.stops.every((stop: ProductRouteV1["stops"][number]) => stop.catalogEvidence!.length > 0 && stop.conditionAcknowledged !== true)).toBe(true);
    if (!mode.date) {
      expect(body.route.routeSummary.startAt).toBeNull();
      expect(body.route.stops.every((stop: { arrivalAt: unknown; arrivalOffsetSeconds: number }) => stop.arrivalAt === null && stop.arrivalOffsetSeconds >= 0)).toBe(true);
      expect(JSON.stringify(body)).not.toContain("2000-01-01");
    }
  });
}
