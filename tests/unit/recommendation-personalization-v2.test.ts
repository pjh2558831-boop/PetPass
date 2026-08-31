import { describe, expect, it } from "vitest";
import {
  scoreCandidatePersonalizationV2,
  type PersonalizationCandidateV2,
  type PersonalizationContextV2,
} from "@/lib/recommendation/v2/personalization";

const BASE_CANDIDATE: PersonalizationCandidateV2 = {
  canonicalId: "tour:1",
  category: "attraction",
  eligibilityTier: "verified",
  environment: "outdoor",
  scheduleStatus: "known",
  distanceKm: 4,
  informationTrust: 0.9,
  dataCompleteness: 0.9,
  highActivity: true,
  popularitySignal: 0.85,
};

const BASE_CONTEXT: PersonalizationContextV2 = {
  environmentPreference: "any",
  petCount: 1,
  petActivityLevel: "moderate",
  walkingTolerance: "moderate",
  crowdPreference: "any",
  tripMood: "balanced",
  categoryPriorities: { attraction: 0.8 },
  recentlySelectedCandidateIds: [],
  rerollVariant: 0,
};

describe("recommendation personalization V2", () => {
  it("penalizes uncertainty without filtering the candidate", () => {
    const verified = scoreCandidatePersonalizationV2(BASE_CANDIDATE, BASE_CONTEXT);
    const unverified = scoreCandidatePersonalizationV2(
      { ...BASE_CANDIDATE, eligibilityTier: "unverified" },
      BASE_CONTEXT,
    );

    expect(unverified.total).toBeGreaterThan(0);
    expect(unverified.total).toBeLessThan(verified.total);
    expect(unverified.explanationCodes).toContain("pet_evidence_unverified");
  });

  it("uses indoor and outdoor preferences as soft score changes", () => {
    const any = scoreCandidatePersonalizationV2(BASE_CANDIDATE, BASE_CONTEXT);
    const outdoor = scoreCandidatePersonalizationV2(BASE_CANDIDATE, {
      ...BASE_CONTEXT,
      environmentPreference: "outdoor_preferred",
    });
    const indoor = scoreCandidatePersonalizationV2(BASE_CANDIDATE, {
      ...BASE_CONTEXT,
      environmentPreference: "indoor_preferred",
    });

    expect(outdoor.total).toBeGreaterThan(any.total);
    expect(any.total).toBeGreaterThan(indoor.total);
  });

  it("lets pet activity and walking tolerance change comfort ranking", () => {
    const active = scoreCandidatePersonalizationV2(BASE_CANDIDATE, {
      ...BASE_CONTEXT,
      petActivityLevel: "high",
      walkingTolerance: "high",
    });
    const lowTolerance = scoreCandidatePersonalizationV2(BASE_CANDIDATE, {
      ...BASE_CONTEXT,
      petActivityLevel: "low",
      walkingTolerance: "low",
    });

    expect(active.styleUtilities.comfort).toBeGreaterThan(
      lowTolerance.styleUtilities.comfort,
    );
  });

  it("lets explicit category priority dominate the preference style", () => {
    const attraction = scoreCandidatePersonalizationV2(BASE_CANDIDATE, {
      ...BASE_CONTEXT,
      categoryPriorities: { attraction: 1, food: 0.1 },
    });
    const deprioritized = scoreCandidatePersonalizationV2(BASE_CANDIDATE, {
      ...BASE_CONTEXT,
      categoryPriorities: { attraction: 0.1, food: 1 },
    });

    expect(attraction.styleUtilities.preference).toBeGreaterThan(
      deprioritized.styleUtilities.preference,
    );
  });

  it("applies a deterministic repeated-place penalty for rerolls", () => {
    const first = scoreCandidatePersonalizationV2(BASE_CANDIDATE, BASE_CONTEXT);
    const reroll = scoreCandidatePersonalizationV2(BASE_CANDIDATE, {
      ...BASE_CONTEXT,
      recentlySelectedCandidateIds: ["tour:1"],
      rerollVariant: 1,
    });

    expect(reroll.total).toBeLessThan(first.total);
    expect(reroll.explanationCodes).toContain("recent_place_penalty");
    expect(scoreCandidatePersonalizationV2(BASE_CANDIDATE, BASE_CONTEXT)).toEqual(first);
  });

  it("does not penalize a protected intentional anchor", () => {
    const first = scoreCandidatePersonalizationV2(BASE_CANDIDATE, {
      ...BASE_CONTEXT,
      protectedCandidateIds: ["tour:1"],
    });
    const protectedReroll = scoreCandidatePersonalizationV2(BASE_CANDIDATE, {
      ...BASE_CONTEXT,
      recentRouteSignatures: ["tour:1>tour:2>tour:3"],
      recentlySelectedCandidateIds: ["tour:1"],
      protectedCandidateIds: ["tour:1"],
      rerollVariant: 1,
    });

    expect(protectedReroll.total).toBe(first.total);
    expect(protectedReroll.noveltyAdjustment).toBe(0);
    expect(protectedReroll.explanationCodes)
      .toContain("novelty_penalty_exempt_intentional_anchor");
  });

  it("uses crowd preference and authoritative popularity without filtering", () => {
    const popular = scoreCandidatePersonalizationV2(BASE_CANDIDATE, {
      ...BASE_CONTEXT,
      crowdPreference: "enjoy",
    });
    const quiet = scoreCandidatePersonalizationV2(BASE_CANDIDATE, {
      ...BASE_CONTEXT,
      crowdPreference: "avoid",
    });

    expect(popular.styleUtilities.preference).toBeGreaterThan(quiet.styleUtilities.preference);
    expect(quiet.total).toBeGreaterThan(0);
  });

  it("modestly favors stronger pet evidence when multiple pets are traveling", () => {
    const verified = scoreCandidatePersonalizationV2(BASE_CANDIDATE, {
      ...BASE_CONTEXT,
      petCount: 2,
    });
    const unverified = scoreCandidatePersonalizationV2({
      ...BASE_CANDIDATE,
      eligibilityTier: "unverified",
    }, {
      ...BASE_CONTEXT,
      petCount: 2,
    });

    expect(verified.components.petProfileCompatibility)
      .toBeGreaterThan(unverified.components.petProfileCompatibility);
    expect(unverified.total).toBeGreaterThan(0);
  });
});
