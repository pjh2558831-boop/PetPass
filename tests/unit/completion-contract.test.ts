import { describe, expect, it } from "vitest";
import { routeRecommendationRequestSchema } from "@/lib/recommendation/recommendation-request";
import { createRouteRecommendationRequest } from "@/lib/recommendation/recommendation-ui-request";
import { evaluateCanonicalPetConditions } from "@/lib/pet-access/canonical-condition-eligibility";
import { extractPolicyClause } from "@/lib/pet-access/tourism/extractor";
import type { TourPetAccessSemanticAssessment } from "@/types/tour-pet-access";

const profile = { id: "test", name: "보리", species: "DOG" as const, size: "SMALL" as const, hasCarrier: false, hasLeash: false, hasMuzzle: false, acceptsOutdoorOnly: false };
const preferences = { regionCode: "26", regionName: "부산", tripDate: "", startTime: "", tripType: "DAY_TRIP" as const, tripPace: "balanced" as const, preferredCategories: ["ATTRACTION" as const], departure: { label: "부산역", coordinates: { latitude: 35.115, longitude: 129.04 } } };

describe("completion-first contract", () => {
  it("does not turn old checkbox defaults into assertions or require a schedule", () => {
    const request = createRouteRecommendationRequest(profile, preferences);
    expect(request).toMatchObject({ requestVersion: 2, trip: { date: null, startTime: null } });
    expect(request.pet).not.toHaveProperty("availableEquipment");
    expect(request.pet).not.toHaveProperty("acceptsOutdoorOnlyPlaces");
    expect(routeRecommendationRequestSchema.safeParse(request).success).toBe(true);
  });

  it.each([[null, null], ["2026-09-12", null], [null, "10:30"], ["2026-09-12", "10:30"]])("accepts date %s / time %s without accepting malformed values", (date, startTime) => {
    const request = { requestVersion: 2, departure: { label: "부산역", latitude: 35.115, longitude: 129.04, source: "kakao_place_search" }, trip: { regionId: "busan", districtId: null, date, startTime, tripType: "day_trip", tripPace: "balanced", selectedCategories: ["attraction"], roundTrip: false }, pet: { name: "보리", species: "DOG", size: "SMALL" } };
    expect(routeRecommendationRequestSchema.safeParse(request).success).toBe(true);
    expect(routeRecommendationRequestSchema.safeParse({ ...request, trip: { ...request.trip, date: "2026-02-30" } }).success).toBe(false);
    expect(routeRecommendationRequestSchema.safeParse({ ...request, trip: { ...request.trip, startTime: "25:00" } }).success).toBe(false);
  });

  it("keeps a scoped muzzle instruction as guidance with its original subject", () => {
    const text = "맹견의 경우, 입마개 착용 필수";
    const extracted = extractPolicyClause({ originalText: text, normalizedText: text });
    expect(extracted.conditions.map(x => x.type)).toEqual(["muzzle_required"]);
    const assessment: TourPetAccessSemanticAssessment = { rulesetVersion: "2", verdict: "conditional", evaluationState: "complete", confidence: "high", reasonCodes: [], summary: text, permittedScopes: ["whole_place"], restrictedScopes: [], conditions: extracted.conditions.map(x => ({ ...x, scope: extracted.scope, evidenceIds: ["source:1"] })), evidence: [], conflicts: [], verificationItems: [], providerModifiedTime: null, sources: [], warnings: [] };
    const result = evaluateCanonicalPetConditions({ assessment, petProfile: { species: "DOG", size: "SMALL", hasLeash: null, hasCarrier: null, hasMuzzle: null, acceptsOutdoorOnly: null }, sizeCompatibility: "compatible" });
    expect(result.state).toBe("eligible");
    expect(result.confirmationRequiredConditions).toHaveLength(0);
    expect(result.warnings.some(x => x.sourceText === text)).toBe(true);
  });
});
