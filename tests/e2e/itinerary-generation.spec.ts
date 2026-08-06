import { expect, test } from "@playwright/test";

const BASE_REQUEST = {
  scope: { type: "busan" },
  start: {
    coordinates: { latitude: 35.115, longitude: 129.04 },
    label: "부산역",
  },
  travelDate: "2026-08-06",
  startTime: "10:00",
  planning: { desiredStopCount: 2 },
  petSize: "SMALL",
  indoorAccessPreference: "any",
  selectedCategories: ["attraction", "leisure", "food"],
  includeShopping: false,
};

test("builds real-boundary itineraries from Tourism details and Kakao directions", async ({
  request,
}) => {
  const response = await request.post("/api/itineraries/generate", {
    data: BASE_REQUEST,
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body.data.state).toBe("ready");
  expect(body.data.itineraries.length).toBeGreaterThan(0);
  expect(body.data.itineraries.length).toBeLessThanOrEqual(3);
  expect(body.data.providerCalls.detail).toBeLessThanOrEqual(
    body.data.limits.maxDetailCalls,
  );
  expect(body.data.providerCalls.directions).toBeLessThanOrEqual(
    body.data.limits.maxDirectionsCalls,
  );
  for (const itinerary of body.data.itineraries) {
    expect(itinerary.totalDistanceMeters).toBeGreaterThan(0);
    expect(itinerary.totalDurationSeconds).toBeGreaterThan(0);
    expect(itinerary.geometry.length).toBeGreaterThan(1);
    for (const stop of itinerary.stops) {
      expect(stop.contentId).not.toContain("demo-");
      expect(["allowed", "conditional"]).toContain(stop.petAccess.verdict);
      expect(stop.providerContentTypeId).toBe(stop.contentTypeId);
      expect(stop).not.toHaveProperty("licensing");
    }
  }
  expect(JSON.stringify(body)).not.toContain("serviceKey");
  expect(JSON.stringify(body)).not.toContain("Authorization");
});

test("changes scope and category results while keeping shopping opt-in", async ({
  request,
}) => {
  const district = await request.post("/api/itineraries/generate", {
    data: {
      ...BASE_REQUEST,
      scope: { type: "district", districtCode: "350" },
      selectedCategories: ["attraction", "food"],
    },
  });
  const shoppingOff = await request.post("/api/itineraries/generate", {
    data: {
      ...BASE_REQUEST,
      selectedCategories: ["shopping"],
      includeShopping: false,
    },
  });
  const shoppingOn = await request.post("/api/itineraries/generate", {
    data: {
      ...BASE_REQUEST,
      planning: { desiredStopCount: 2 },
      selectedCategories: ["shopping", "attraction"],
      includeShopping: true,
    },
  });

  const districtBody = await district.json();
  const shoppingOffBody = await shoppingOff.json();
  const shoppingOnBody = await shoppingOn.json();
  expect(districtBody.data.request.scope).toMatchObject({
    type: "district",
    districtCode: "350",
  });
  expect(shoppingOffBody.data.itineraries).toEqual([]);
  expect(shoppingOffBody.data.exclusionCounts.shopping_disabled).toBe(1);
  expect(
    shoppingOnBody.data.itineraries
      .flatMap((itinerary: { stops: Array<{ category: string }> }) => itinerary.stops)
      .some((stop: { category: string }) => stop.category === "shopping"),
  ).toBe(true);
});
