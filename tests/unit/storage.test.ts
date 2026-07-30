import { describe, expect, it } from "vitest";
import { demoItinerary, demoProfile } from "@/fixtures/demo-data";
import {
  loadPetProfile,
  savePetProfile,
} from "@/lib/storage/profile-storage";
import {
  loadDraftItinerary,
  saveDraftItinerary,
} from "@/lib/storage/itinerary-storage";
import type { StorageLike } from "@/lib/storage/versioned-storage";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("versioned storage", () => {
  it("round-trips validated profiles", () => {
    const storage = new MemoryStorage();
    expect(savePetProfile(demoProfile, storage)).toBe(true);
    expect(loadPetProfile(storage)).toEqual(demoProfile);
  });

  it("round-trips a draft itinerary", () => {
    const storage = new MemoryStorage();
    expect(saveDraftItinerary(demoItinerary, storage)).toBe(true);
    expect(loadDraftItinerary(storage)?.id).toBe(demoItinerary.id);
  });

  it("recovers from corrupted JSON by clearing it", () => {
    const storage = new MemoryStorage();
    storage.setItem("petpass:pet-profile", "{broken");
    expect(loadPetProfile(storage)).toBeNull();
    expect(storage.getItem("petpass:pet-profile")).toBeNull();
  });

  it("clears unsupported future schema versions", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "petpass:pet-profile",
      JSON.stringify({ version: 99, data: demoProfile }),
    );
    expect(loadPetProfile(storage)).toBeNull();
    expect(storage.getItem("petpass:pet-profile")).toBeNull();
  });
});
