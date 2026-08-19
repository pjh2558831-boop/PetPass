import { itinerarySchema } from "@/lib/shared/domain-schemas";
import {
  readVersionedValue,
  writeVersionedValue,
  type StorageLike,
} from "@/lib/storage/versioned-storage";
import type { Itinerary } from "@/types/itinerary";

const STORAGE_VERSION = 1;
const ITINERARY_KEY = "petpass:draft-itinerary";
const readCache = new WeakMap<StorageLike, Itinerary | null>();

export function loadDraftItinerary(storage?: StorageLike | null): Itinerary | null {
  const resolvedStorage =
    storage === undefined
      ? typeof window === "undefined"
        ? null
        : window.localStorage
      : storage;
  if (!resolvedStorage) return null;
  if (readCache.has(resolvedStorage)) {
    return readCache.get(resolvedStorage) ?? null;
  }
  const value = readVersionedValue(ITINERARY_KEY, itinerarySchema, {
    version: STORAGE_VERSION,
    storage: resolvedStorage,
  });
  readCache.set(resolvedStorage, value);
  return value;
}

export function saveDraftItinerary(
  itinerary: Itinerary,
  storage?: StorageLike | null,
): boolean {
  const resolvedStorage =
    storage === undefined
      ? typeof window === "undefined"
        ? null
        : window.localStorage
      : storage;
  if (!resolvedStorage) return false;
  const saved = writeVersionedValue(ITINERARY_KEY, itinerary, itinerarySchema, {
    version: STORAGE_VERSION,
    storage: resolvedStorage,
  });
  if (saved) readCache.set(resolvedStorage, itinerary);
  return saved;
}
