import { itinerarySchema } from "@/lib/shared/domain-schemas";
import {
  readVersionedValue,
  writeVersionedValue,
  type StorageLike,
} from "@/lib/storage/versioned-storage";
import type { Itinerary } from "@/types/itinerary";

const STORAGE_VERSION = 1;
const ITINERARY_KEY = "petpass:draft-itinerary";

export function loadDraftItinerary(storage?: StorageLike | null): Itinerary | null {
  return readVersionedValue(ITINERARY_KEY, itinerarySchema, {
    version: STORAGE_VERSION,
    storage,
  });
}

export function saveDraftItinerary(
  itinerary: Itinerary,
  storage?: StorageLike | null,
): boolean {
  return writeVersionedValue(ITINERARY_KEY, itinerary, itinerarySchema, {
    version: STORAGE_VERSION,
    storage,
  });
}
