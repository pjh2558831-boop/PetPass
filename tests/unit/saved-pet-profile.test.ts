import { describe, expect, it } from "vitest";
import {
  savedPetProfileFromRow,
  savedPetProfileToRow,
} from "@/lib/auth/pet-profile";

describe("saved pet profile persistence", () => {
  const userId = "9f791b6b-44dd-40ae-984a-503a275605eb";

  it("maps a validated database row to the existing planner profile contract", () => {
    expect(
      savedPetProfileFromRow({
        user_id: userId,
        name: "  보리  ",
        species: "DOG",
        size: "MEDIUM",
        has_carrier: true,
        has_leash: true,
        has_muzzle: false,
        accepts_outdoor_only: true,
        created_at: "2026-08-23T00:00:00.000Z",
        updated_at: "2026-08-23T00:00:00.000Z",
      }),
    ).toEqual({
      id: userId,
      name: "보리",
      species: "DOG",
      size: "MEDIUM",
      hasCarrier: true,
      hasLeash: true,
      hasMuzzle: false,
      acceptsOutdoorOnly: true,
    });
  });

  it("maps only the allowlisted planner fields to an owner-bound upsert", () => {
    expect(
      savedPetProfileToRow(userId, {
        id: "client-controlled-id",
        name: "  보리  ",
        species: "DOG",
        size: "SMALL",
        hasCarrier: false,
        hasLeash: true,
        hasMuzzle: false,
        acceptsOutdoorOnly: false,
      }),
    ).toEqual({
      user_id: userId,
      name: "보리",
      species: "DOG",
      size: "SMALL",
      has_carrier: false,
      has_leash: true,
      has_muzzle: false,
      accepts_outdoor_only: false,
    });
  });

  it("rejects invalid database enum values instead of repairing them", () => {
    expect(() =>
      savedPetProfileFromRow({
        user_id: userId,
        name: "보리",
        species: "BIRD",
        size: "SMALL",
        has_carrier: false,
        has_leash: true,
        has_muzzle: false,
        accepts_outdoor_only: false,
        created_at: "2026-08-23T00:00:00.000Z",
        updated_at: "2026-08-23T00:00:00.000Z",
      }),
    ).toThrow();
  });
});
