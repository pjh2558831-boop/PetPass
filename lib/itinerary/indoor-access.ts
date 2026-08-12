import type { TourPetAccessSemanticAssessment } from "@/types/tour-pet-access";

const CONFIRMED_INDOOR_SCOPES = new Set([
  "whole_place",
  "indoor",
  "guest_room",
  "selected_room",
  "common_area",
  "restaurant",
  "cafe",
  "lobby",
]);

/**
 * A required-indoor request needs positive provider-derived scope evidence.
 * Merely lacking an outdoor-only restriction is not confirmation.
 */
export function supportsRequiredIndoorAccess(
  assessment: TourPetAccessSemanticAssessment,
): boolean {
  if (
    assessment.restrictedScopes.includes("indoor") ||
    assessment.conditions.some(
      ({ type }) => type === "outdoor_only" || type === "indoor_restricted",
    )
  ) {
    return false;
  }
  return assessment.permittedScopes.some((scope) =>
    CONFIRMED_INDOOR_SCOPES.has(scope),
  );
}
