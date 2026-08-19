import { loadDraftItinerary } from "@/lib/storage/itinerary-storage";
import {
  loadSavedRouteRecommendation,
  type SavedRouteRecommendationSnapshotV1,
} from "@/lib/storage/recommendation-storage";
import type { StorageLike } from "@/lib/storage/versioned-storage";
import type { Itinerary } from "@/types/itinerary";
import type { GeneratedItinerary } from "@/types/route-generation";

export type ItineraryRestoration =
  | { source: "in_memory"; itinerary: GeneratedItinerary }
  | {
      source: "saved_recommendation";
      snapshot: SavedRouteRecommendationSnapshotV1;
    }
  | { source: "legacy_itinerary"; itinerary: Itinerary }
  | { source: "empty" };

export function selectItineraryRestoration(
  currentItinerary: GeneratedItinerary | null,
  savedRecommendation: SavedRouteRecommendationSnapshotV1 | null,
  legacyItinerary: Itinerary | null,
): ItineraryRestoration {
  if (currentItinerary) {
    return { source: "in_memory", itinerary: currentItinerary };
  }
  if (savedRecommendation) {
    return { source: "saved_recommendation", snapshot: savedRecommendation };
  }
  if (legacyItinerary) {
    return { source: "legacy_itinerary", itinerary: legacyItinerary };
  }
  return { source: "empty" };
}

export function loadStoredItineraryRestoration(
  storage?: StorageLike | null,
): ItineraryRestoration {
  const savedRecommendation = loadSavedRouteRecommendation(storage);
  if (savedRecommendation) {
    return selectItineraryRestoration(null, savedRecommendation, null);
  }
  return selectItineraryRestoration(
    null,
    null,
    loadDraftItinerary(storage),
  );
}
