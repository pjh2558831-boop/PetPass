import { describe, expect, it } from "vitest";
import {
  isMissingMultiPetSchemaError,
  savedPetProfileFromLegacyRow,
} from "@/lib/auth/pet-profile";

const userId = "9cb93665-7051-42eb-91cc-45d5aaad8a32";

describe("account pet schema compatibility", () => {
  it("recognizes the missing multi-pet columns reported by PostgREST", () => {
    expect(isMissingMultiPetSchemaError({
      code: "42703",
      message: "column pet_profiles.id does not exist",
    })).toBe(true);
    expect(isMissingMultiPetSchemaError({
      code: "42703",
      message: "column pet_profiles.image_path does not exist",
    })).toBe(true);
    expect(isMissingMultiPetSchemaError({
      code: "42501",
      message: "permission denied for table pet_profiles",
    })).toBe(false);
  });

  it("projects the legacy singleton row as a read-only pet card", () => {
    expect(savedPetProfileFromLegacyRow({
      user_id: userId,
      name: "까꿍",
      species: "DOG",
      size: "SMALL",
      has_carrier: false,
      has_leash: true,
      has_muzzle: false,
      accepts_outdoor_only: false,
      created_at: "2026-08-23T13:49:32.000Z",
      updated_at: "2026-08-23T13:49:32.000Z",
    })).toMatchObject({
      id: userId,
      name: "까꿍",
      imagePath: null,
    });
  });
});
