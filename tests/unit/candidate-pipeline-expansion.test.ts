import { describe, expect, it } from "vitest";
import {
  adaptiveEligiblePoolTargetV1,
  selectDetailedEvaluationCandidatesV1,
} from "@/lib/recommendation/candidate-pipeline";
import type { ScheduledRouteCandidate } from "@/lib/recommendation/types";

function candidate(id: string, districtCode: string, total: number): ScheduledRouteCandidate {
  return {
    contentId: id,
    category: "attraction",
    region: { regionCode: "26", districtCode },
    distanceKm: 1,
    retrievalScore: {
      total,
      categoryCoverageNeed: 0.1,
    },
    scheduleCompatibility: { status: "compatible", reasonCodes: [], warningCodes: [] },
  } as unknown as ScheduledRouteCandidate;
}

describe("safe candidate-pool expansion", () => {
  it("computes an adaptive eligibility target from stops and prior exposure", () => {
    expect(adaptiveEligiblePoolTargetV1({
      maxStops: 4,
      recentlySelectedCandidateCount: 0,
      maximumTarget: 30,
    })).toBe(12);
    expect(adaptiveEligiblePoolTargetV1({
      maxStops: 4,
      recentlySelectedCandidateCount: 8,
      maximumTarget: 30,
    })).toBe(20);
  });

  it("applies the bounded detail cap after category and district diversity are available", () => {
    const dominant = Array.from({ length: 29 }, (_, index) =>
      candidate(`dominant-${String(index).padStart(2, "0")}`, "350", 1_000 - index));
    const otherDistrict = [
      candidate("other-1", "710", 100),
      candidate("other-2", "710", 99),
    ];
    const selected = selectDetailedEvaluationCandidatesV1({
      candidates: [...dominant, ...otherDistrict],
      limit: 30,
      requiredContentIds: new Set(),
    });

    expect(selected).toHaveLength(30);
    expect(selected.map(({ contentId }) => contentId)).toEqual(
      expect.arrayContaining(["other-1", "other-2"]),
    );
  });
});
