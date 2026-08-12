import { describe, expect, it } from "vitest";
import { demoItinerary, demoPlaces, demoProfile } from "@/fixtures/demo-data";
import {
  itinerarySchema,
  petPlaceSchema,
  petProfileSchema,
  travelPreferencesSchema,
} from "@/lib/shared/domain-schemas";

const legacyTravelPreferences = {
  regionCode: "26",
  regionName: "부산",
  tripDate: "2026-08-15",
  tripType: "DAY_TRIP" as const,
  startTime: "10:00",
  preferredCategories: ["ATTRACTION", "RESTAURANT", "CAFE"] as const,
};

describe("core domain schemas", () => {
  it("accepts the supported demo models", () => {
    expect(petProfileSchema.parse(demoProfile)).toEqual(demoProfile);
    expect(petPlaceSchema.array().parse(demoPlaces)).toHaveLength(5);
    expect(itinerarySchema.parse(demoItinerary).stops).toHaveLength(3);
  });

  it("rejects unsupported pet access statuses", () => {
    const invalid = structuredClone(demoPlaces[0]);
    invalid.accessAssessment.status = "MAYBE" as never;
    expect(petPlaceSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects invalid geographic coordinates", () => {
    const invalid = structuredClone(demoPlaces[0]);
    invalid.coordinates.latitude = 120;
    expect(petPlaceSchema.safeParse(invalid).success).toBe(false);
  });

  it("keeps legacy travel preferences valid without Phase 3B optional fields", () => {
    expect(travelPreferencesSchema.parse(legacyTravelPreferences)).toEqual({
      ...legacyTravelPreferences,
      tripPace: "balanced",
    });
  });

  it("accepts a resolved departure with valid coordinates", () => {
    expect(
      travelPreferencesSchema.parse({
        ...legacyTravelPreferences,
        departure: {
          label: "  부산광역시 연제구 중앙대로 1001  ",
          coordinates: { latitude: 35.1796, longitude: 129.0756 },
        },
        planningMode: "duration",
        desiredDurationMinutes: 240,
        indoorAccessPreference: "required",
        includeShopping: true,
      }),
    ).toMatchObject({
      departure: {
        label: "부산광역시 연제구 중앙대로 1001",
        coordinates: { latitude: 35.1796, longitude: 129.0756 },
      },
    });
  });

  it.each([
    ["latitude", { latitude: 90.0001, longitude: 129.0756 }],
    ["longitude", { latitude: 35.1796, longitude: 180.0001 }],
  ])("rejects an out-of-bounds departure %s", (_field, coordinates) => {
    expect(
      travelPreferencesSchema.safeParse({
        ...legacyTravelPreferences,
        departure: { label: "부산광역시청", coordinates },
      }).success,
    ).toBe(false);
  });
});
