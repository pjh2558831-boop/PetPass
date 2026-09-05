import {
  petProfileSchema,
  travelPreferencesSchema,
} from "@/lib/shared/domain-schemas";
import {
  readVersionedValue,
  writeVersionedValue,
  type StorageLike,
} from "@/lib/storage/versioned-storage";
import type { PetProfile, TravelPreferences } from "@/types/pet";

const STORAGE_VERSION = 2;
const PROFILE_KEY = "petpass:pet-profile";
const PREFERENCES_KEY = "petpass:travel-preferences";

export function loadPetProfile(storage?: StorageLike | null): PetProfile | null {
  return readVersionedValue(PROFILE_KEY, petProfileSchema, {
    version: STORAGE_VERSION,
    migrations: { 1: (old) => ({ ...old as object, hasCarrier: null, hasLeash: null, hasMuzzle: null, acceptsOutdoorOnly: null }) },
    storage,
  });
}

export function savePetProfile(
  profile: PetProfile,
  storage?: StorageLike | null,
): boolean {
  return writeVersionedValue(PROFILE_KEY, profile, petProfileSchema, {
    version: STORAGE_VERSION,
    storage,
  });
}

export function loadTravelPreferences(
  storage?: StorageLike | null,
): TravelPreferences | null {
  return readVersionedValue(PREFERENCES_KEY, travelPreferencesSchema, {
    migrations: { 1: (old) => old },
    version: STORAGE_VERSION,
    storage,
  });
}

export function saveTravelPreferences(
  preferences: TravelPreferences,
  storage?: StorageLike | null,
): boolean {
  return writeVersionedValue(PREFERENCES_KEY, preferences, travelPreferencesSchema, {
    version: STORAGE_VERSION,
    storage,
  });
}
