import { describe, expect, it } from "vitest";
import { recommendationProductRouteSchema } from "@/lib/recommendation/recommendation-response";
import { attachRouteSchedule } from "@/lib/recommendation/schedule/route-schedule";
import type { ProductRouteV1 } from "@/types/recommendation";

const route: ProductRouteV1 = {
  planningPolicy: "full_public_catalog_v1",
  venueCompatibility: "unchecked",
  id: "optimized:broad",
  kind: "optimized",
  label: "지리 경로 초안",
  routeSummary: { startAt: "2026-09-05T01:00:00.000Z", endAt: "2026-09-05T02:00:00.000Z", stopCount: 1, totalDistanceMeters: 1000, totalDrivingSeconds: 600, totalVisitSeconds: 3000, totalWaitSeconds: 0 },
  temporalBasis: { searchMatrix: "current_traffic", finalRoute: "current_traffic" },
  stops: [{
    placeId: "kakao:closed", sequence: 1, title: "공개 장소", address: null,
    coordinates: { latitude: 37.5, longitude: 127 }, category: "unknown",
    arrivalAt: "2026-09-05T01:10:00.000Z", visitStartsAt: "2026-09-05T01:10:00.000Z", departureAt: "2026-09-05T02:00:00.000Z",
    dwellMinutes: 50, driveSecondsFromPrevious: 600, distanceMetersFromPrevious: 1000,
    source: "kakao_catalog", sourceLabel: "카카오 검색 후보", petAssessment: "not_allowed",
    operatingStatus: "reported_closed", licensingStatus: "confirmed_closed",
    mandatoryConditions: [], informationTrust: "low", operatingHoursWarnings: ["reported_closed"],
    inclusionReasonCodes: ["full_public_catalog_candidate"], orderingReasonCodes: ["route_objective_order"], warningCodes: ["pet_access_not_allowed"], evidence: [],
    catalogEvidence: [{ provider: "kakao", providerPlaceId: "closed", petAssessment: "not_allowed", originalText: "반려동물 동반 불가", retrievedAt: "2026-09-05T00:00:00.000Z", publicLabel: "카카오 검색 후보" }],
  }],
  geometry: [{ latitude: 37.49, longitude: 126.99 }, { latitude: 37.5, longitude: 127 }],
  confirmationStatus: "ready",
};

describe("full public catalog response contract", () => {
  it("preserves negative pet and closure evidence in a valid geographic draft", () => {
    expect(recommendationProductRouteSchema.safeParse(route).success).toBe(true);
  });

  it("does not claim calendar or operating-hours checks for broad planning", () => {
    const scheduled = attachRouteSchedule(route, { date: "2026-09-05", startTime: "10:00" }, "10:00");
    expect(scheduled.schedule).toMatchObject({ calendarValidation: "unchecked", operatingAvailability: "unchecked" });
    expect(scheduled.schedule?.reasonCodes).toContain("venue_compatibility_unchecked");
  });

  it("bounds provider evidence text", () => {
    const oversized = { ...route, stops: [{ ...route.stops[0]!, catalogEvidence: [{ ...route.stops[0]!.catalogEvidence![0]!, originalText: "x".repeat(2001) }] }] };
    expect(recommendationProductRouteSchema.safeParse(oversized).success).toBe(false);
  });
});
