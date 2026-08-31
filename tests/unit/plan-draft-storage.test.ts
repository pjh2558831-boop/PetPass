import { describe, expect, it } from "vitest";
import {
  PLAN_DRAFT_SCHEMA_VERSION,
  createPlanDraft,
  loadPlanDraft,
  plannerInputFromPlanDraft,
  savePlanDraft,
  updatePlanDraftFromPlanner,
  updatePlanDraftSelection,
} from "@/lib/storage/plan-draft-storage";
import type { StorageLike } from "@/lib/storage/versioned-storage";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe("shared PlanDraft storage", () => {
  it("stores only bounded planner settings and compact selected-place evidence", () => {
    const storage = new MemoryStorage();
    const selected = updatePlanDraftSelection(createPlanDraft("seoul"), {
      regionId: "seoul",
      districtId: "110",
      autoFill: false,
      includeVerificationRequired: false,
      acknowledgedVerificationRequiredPlaceIds: ["tour:101"],
      places: [{
        id: "tour:101",
        regionId: "seoul",
        providerPlaceId: "101",
        name: "선택 장소",
        layer: "tourism",
        category: "attraction",
        sourceLabel: "한국관광공사",
        publicLabel: "동반 가능 여부 확인 필요",
        petAccessVerdict: "unknown",
        imageUrl: "https://images.example.test/large-provider-image.jpg",
      }],
    });
    const draft = updatePlanDraftFromPlanner(selected, {
      petProfile: {
        id: "pet-1", name: "까꿍", species: "DOG", size: "SMALL",
        hasCarrier: false, hasLeash: true, hasMuzzle: false,
        acceptsOutdoorOnly: false,
      },
      preferences: {
        regionCode: "11", regionName: "서울", districtCode: "110",
        districtName: "종로구", tripDate: "2026-09-12", tripType: "DAY_TRIP",
        tripPace: "balanced", startTime: "10:00",
        preferredCategories: [], desiredStopCount: 3,
        planningMode: "duration", desiredDurationMinutes: 360, roundTrip: true,
        departure: {
          label: "서울역", source: "kakao_place_search",
          coordinates: { latitude: 37.5547, longitude: 126.9707 },
        },
      },
    });

    expect(savePlanDraft(draft, storage)).toBe(true);
    expect(loadPlanDraft(storage)).toMatchObject({
      schemaVersion: PLAN_DRAFT_SCHEMA_VERSION,
      regionId: "seoul",
      districtId: "110",
      selectedPlaces: [{
        id: "tour:101",
        provider: "kto",
        evidence: { verdict: "unknown", label: "동반 가능 여부 확인 필요" },
        locked: true,
      }],
      origin: { name: "서울역", latitude: 37.5547, longitude: 126.9707 },
      requestedStopCount: 3,
      requestedCategories: ["attraction"],
      endTime: "16:00",
      autoFill: false,
      includeVerificationRequired: false,
      roundTrip: true,
    });
    expect([...storage.values.values()].join(""))
      .not.toContain("large-provider-image.jpg");
    expect(plannerInputFromPlanDraft(draft)).toMatchObject({
      petProfile: { id: "pet-1", name: "까꿍" },
      preferences: {
        regionCode: "11",
        districtCode: "110",
        preferredCategories: ["ATTRACTION"],
        departure: { label: "서울역" },
      },
    });
  });

  it("rejects an unsupported future draft version without touching unrelated keys", () => {
    const storage = new MemoryStorage();
    storage.setItem("weekendog:plan-draft", JSON.stringify({ version: 99, data: {} }));
    storage.setItem("unrelated", "keep");

    expect(loadPlanDraft(storage)).toBeNull();
    expect(storage.getItem("unrelated")).toBe("keep");
  });
});
