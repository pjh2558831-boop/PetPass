import { describe, expect, it } from "vitest";
import { createRouteRecommendationRequest } from "@/lib/recommendation/recommendation-ui-request";
import type { PetProfile, TravelPreferences } from "@/types/pet";

const profile: PetProfile = {
  id: "pet-1",
  name: "까꿍",
  species: "DOG",
  size: "SMALL",
  hasCarrier: false,
  hasLeash: true,
  hasMuzzle: false,
  acceptsOutdoorOnly: false,
};

const preferences: TravelPreferences = {
  regionCode: "26",
  regionName: "부산광역시",
  tripDate: "2026-09-12",
  tripType: "DAY_TRIP",
  tripPace: "balanced",
  startTime: "10:00",
  preferredCategories: ["ATTRACTION"],
  planningMode: "stop_count",
  desiredStopCount: 3,
  desiredDurationMinutes: 360,
  environmentPreference: "any",
  includeShopping: false,
  roundTrip: false,
  departure: {
    label: "부산역",
    coordinates: { latitude: 35.1151, longitude: 129.0414 },
    source: "kakao_place_search",
  },
};

describe("selected itinerary request", () => {
  it("adds canonical selected IDs and auto-fill only for the hybrid flow", () => {
    const request = createRouteRecommendationRequest(profile, preferences, {}, {
      selectedPlaceIds: ["tour:7001", "kakao:9001"],
      autoFill: true,
      selectedCategories: ["attraction", "food"],
    });

    expect(request).toMatchObject({
      selectedPlaceIds: ["tour:7001", "kakao:9001"],
      autoFill: true,
      trip: { selectedCategories: ["attraction", "food"] },
    });
  });

  it("keeps the automatic request backward compatible", () => {
    const request = createRouteRecommendationRequest(profile, preferences);

    expect(request.trip.selectedCategories).toEqual(["attraction"]);
    expect(request).not.toHaveProperty("selectedPlaceIds");
    expect(request).not.toHaveProperty("autoFill");
  });
});
