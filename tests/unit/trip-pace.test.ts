import { describe, expect, it } from "vitest";
import {
  TRIP_PACE_OPTIONS,
  getTripPacePlanning,
} from "@/lib/itinerary/trip-pace";

describe("trip pace", () => {
  it("defines one deterministic planning mapping per user-facing pace", () => {
    expect(TRIP_PACE_OPTIONS.map(({ id }) => id)).toEqual([
      "relaxed",
      "balanced",
      "packed",
    ]);
    expect(getTripPacePlanning("relaxed")).toEqual({ desiredStopCount: 2 });
    expect(getTripPacePlanning("balanced")).toEqual({ desiredStopCount: 3 });
    expect(getTripPacePlanning("packed")).toEqual({ desiredStopCount: 5 });
  });

  it("keeps displayed stop ranges inside the recommendation limit", () => {
    for (const pace of TRIP_PACE_OPTIONS) {
      expect(pace.minStops).toBeGreaterThanOrEqual(1);
      expect(pace.maxStops).toBeLessThanOrEqual(5);
      expect(pace.desiredStopCount).toBeGreaterThanOrEqual(pace.minStops);
      expect(pace.desiredStopCount).toBeLessThanOrEqual(pace.maxStops);
    }
  });

  it("uses the V2 normal minima while retaining the existing targets", () => {
    expect(TRIP_PACE_OPTIONS.map(({ id, minStops, desiredStopCount }) => ({
      id,
      minStops,
      desiredStopCount,
    }))).toEqual([
      { id: "relaxed", minStops: 1, desiredStopCount: 2 },
      { id: "balanced", minStops: 2, desiredStopCount: 3 },
      { id: "packed", minStops: 3, desiredStopCount: 5 },
    ]);
  });
});
