import { describe, expect, it } from "vitest";
import { routeRecommendationRequestSchema } from "@/lib/recommendation/recommendation-request";

const request = {
  requestVersion: 2 as const,
  planningPolicy: "full_public_catalog_v1" as const,
  departure: { label: "서울역", latitude: 37.55, longitude: 126.97, source: "kakao_place_search" as const },
  trip: { regionId: "seoul" as const, districtId: null, date: null, startTime: null, tripType: "overnight" as const, tripPace: "balanced" as const, selectedCategories: [] as string[], roundTrip: false },
  pet: { name: null, species: "DOG" as const, size: "SMALL" as const },
  selectedPlaceIds: ["kakao:123"],
};

describe("full catalog recommendation request", () => {
  it("accepts a selected unknown-category place without legacy acknowledgements or an accommodation preference", () => {
    expect(routeRecommendationRequestSchema.safeParse(request).success).toBe(true);
  });

  it("still rejects an empty request with neither a category nor a selected place", () => {
    const result = routeRecommendationRequestSchema.safeParse({ ...request, selectedPlaceIds: [] });
    expect(result.success).toBe(false);
  });
});
