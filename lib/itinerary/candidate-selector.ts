import { scoreCandidate } from "@/lib/itinerary/scorer";
import type { PetPlace } from "@/types/place";
import type { TravelPreferences } from "@/types/pet";

export function selectCandidates(
  places: PetPlace[],
  preferences: TravelPreferences,
): PetPlace[] {
  return places
    .filter((place) => place.accessAssessment.status !== "NOT_MATCHED")
    .filter((place) => preferences.preferredCategories.includes(place.category))
    .map((place) => ({
      place,
      score: scoreCandidate(place, preferences, 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ place }) => place);
}
