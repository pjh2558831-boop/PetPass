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
      selectedPlaces: [
        { id: "tour:7001", regionId: "busan" },
        { id: "kakao:9001", regionId: "busan" },
      ],
      autoFill: true,
      selectedCategories: ["attraction", "food"],
      acknowledgedVerificationRequiredPlaceIds: ["kakao:9001"],
    });

    expect(request).toMatchObject({
      selectedPlaceIds: ["tour:7001", "kakao:9001"],
      selectedPlaceReferences: [
        { placeId: "tour:7001", regionId: "busan" },
        { placeId: "kakao:9001", regionId: "busan" },
      ],
      acknowledgedVerificationRequiredPlaceIds: ["kakao:9001"],
      autoFill: true,
      trip: { selectedCategories: ["attraction", "food"] },
    });
  });

  it("keeps the automatic request backward compatible", () => {
    const request = createRouteRecommendationRequest(profile, preferences);

    expect(request.trip.selectedCategories).toEqual(["attraction"]);
    expect(request).toMatchObject({
      selectedPlaceIds: [],
      selectedPlaceReferences: [],
      acknowledgedVerificationRequiredPlaceIds: [],
      includeVerificationRequired: false,
      autoFill: true,
    });
  });

  it("derives the request region from the shared 17-region configuration", () => {
    const request = createRouteRecommendationRequest(profile, {
      ...preferences,
      regionCode: "11",
      regionName: "서울특별시",
      districtCode: undefined,
      departure: {
        label: "서울역",
        coordinates: { latitude: 37.5547, longitude: 126.9707 },
        source: "kakao_place_search",
      },
    });

    expect(request.trip.regionId).toBe("seoul");
  });
});
