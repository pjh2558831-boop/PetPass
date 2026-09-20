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

  it("uses the requested recommendation ranges and targets", () => {
    expect(TRIP_PACE_OPTIONS.map(({ id, rangeLabel, minStops, maxStops, desiredStopCount }) => ({
      id,
      rangeLabel,
      minStops,
      maxStops,
      desiredStopCount,
    }))).toEqual([
      { id: "relaxed", rangeLabel: "1~2곳", minStops: 1, maxStops: 2, desiredStopCount: 2 },
      { id: "balanced", rangeLabel: "3~4곳", minStops: 3, maxStops: 4, desiredStopCount: 3 },
      { id: "packed", rangeLabel: "5곳", minStops: 5, maxStops: 5, desiredStopCount: 5 },
    ]);
  });
});
