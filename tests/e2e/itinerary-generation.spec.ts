import { expect, test } from "@playwright/test";

function futureTripDate(): string {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
}

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
      tripPace: "relaxed",
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

test("runs the canonical Stage 2 → 3 → 4 boundary and returns only a validated strict-Tourism route", async ({
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
  expect(serialized).not.toContain("kakao-candidate");
  expect(body.route.stops).toHaveLength(3);
  expect(
    body.route.stops.every(
      (stop: { source?: string }) => stop.source === "tourism_service2",
    ),
  ).toBe(true);
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
