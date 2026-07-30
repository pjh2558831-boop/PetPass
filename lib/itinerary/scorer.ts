import type { PetPlace } from "@/types/place";
import type { TravelPreferences } from "@/types/pet";

const ACCESS_SCORE = {
  AVAILABLE: 40,
  CONDITIONAL: 30,
  NEEDS_CONFIRMATION: 10,
  NOT_MATCHED: 0,
} as const;

export function scoreCandidate(
  place: PetPlace,
  preferences: TravelPreferences,
  distanceKm: number,
): number {
  const access = ACCESS_SCORE[place.accessAssessment.status];
  const operational = place.openingHours ? 25 : 10;
  const distance = Math.max(0, 20 - Math.min(distanceKm, 20));
  const preference = preferences.preferredCategories.includes(place.category) ? 15 : 0;
  return access + operational + distance + preference;
}
