import { describe, expect, it } from "vitest";
import { demoItinerary } from "@/fixtures/demo-data";
import { selectItineraryRestoration } from "@/lib/storage/itinerary-restoration";
import type { SavedRouteRecommendationSnapshotV1 } from "@/lib/storage/recommendation-storage";
import type { GeneratedItinerary } from "@/types/route-generation";

const SAVED_RECOMMENDATION: SavedRouteRecommendationSnapshotV1 = {
  saveState: "legacy_summary",
  engineVersion: "petpass-route-engine-v1",
  objectiveVersion: "route-objective-v1",
  solverVersion: "route-solver-v1",
  requestSummary: {
    departureLabel: "부산역",
    tripDate: "2026-08-15",
    startTime: "10:00",
    tripType: "day_trip",
    tripPace: "balanced",
    selectedCategories: ["attraction", "food"],
    roundTrip: false,
  },
  route: {
    id: "saved-route",
    kind: "manual",
    label: "직접 수정한 일정",
    routeSummary: {
      startAt: "2026-08-15T01:00:00.000Z",
      endAt: "2026-08-15T05:00:00.000Z",
      stopCount: 2,
      totalDistanceMeters: 9_600,
      totalDrivingSeconds: 2_700,
      totalVisitSeconds: 9_000,
      totalWaitSeconds: 0,
    },
    temporalBasis: {
      searchMatrix: "traffic_independent",
      finalRoute: "current_traffic",
    },
    stops: [
      {
        placeId: "1001",
        sequence: 1,
        title: "해운대 공식 공원",
        arrivalAt: "2026-08-15T02:00:00.000Z",
        departureAt: "2026-08-15T03:00:00.000Z",
      },
      {
        placeId: "2001",
        sequence: 2,
        title: "광안 공식 식당",
        arrivalAt: "2026-08-15T04:00:00.000Z",
        departureAt: "2026-08-15T05:00:00.000Z",
      },
    ],
  },
  selectedProviderContentIds: ["1001", "2001"],
  optimality: "optimal_within_candidate_set_current_matrix",
  warningCodes: ["conditional_pet_requirement"],
  manuallyModified: true,
  savedAt: "2026-08-15T00:00:00.000Z",
};

const CURRENT_ITINERARY = {
  id: "current-itinerary",
  title: "현재 탭의 일정",
} as GeneratedItinerary;

describe("itinerary restoration precedence", () => {
  it("keeps a valid current in-memory itinerary ahead of stored snapshots", () => {
    expect(
      selectItineraryRestoration(
        CURRENT_ITINERARY,
        SAVED_RECOMMENDATION,
        demoItinerary,
      ),
    ).toEqual({ source: "in_memory", itinerary: CURRENT_ITINERARY });
  });

  it("uses a saved route recommendation before a legacy itinerary", () => {
    expect(
      selectItineraryRestoration(null, SAVED_RECOMMENDATION, demoItinerary),
    ).toEqual({
      source: "saved_recommendation",
      snapshot: SAVED_RECOMMENDATION,
    });
  });

  it("supports the existing legacy itinerary snapshot as the final fallback", () => {
    expect(selectItineraryRestoration(null, null, demoItinerary)).toEqual({
      source: "legacy_itinerary",
      itinerary: demoItinerary,
    });
  });

  it("returns the neutral empty state when no valid source exists", () => {
    expect(selectItineraryRestoration(null, null, null)).toEqual({
      source: "empty",
    });
  });
});
