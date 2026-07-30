import { describe, expect, it } from "vitest";
import { demoItinerary, demoPlaces, demoProfile } from "@/fixtures/demo-data";
import {
  itinerarySchema,
  petPlaceSchema,
  petProfileSchema,
} from "@/lib/shared/domain-schemas";

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
});
