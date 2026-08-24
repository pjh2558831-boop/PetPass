import { describe, expect, it } from "vitest";
import {
  savedPetProfileFromRow,
  savedPetProfileToRow,
  savedPetProfileToUpdateRow,
} from "@/lib/auth/pet-profile";

describe("saved pet profile persistence", () => {
  const userId = "9f791b6b-44dd-40ae-984a-503a275605eb";
  const petId = "12e3d4aa-4962-4b9d-853c-9e91dc8cc10e";

  it("maps a validated database row to the existing planner profile contract", () => {
    expect(
      savedPetProfileFromRow({
        id: petId,
        user_id: userId,
        name: "  보리  ",
        species: "DOG",
        size: "MEDIUM",
        has_carrier: true,
        has_leash: true,
        has_muzzle: false,
        accepts_outdoor_only: true,
        image_path: `${userId}/${petId}.webp`,
        created_at: "2026-08-23T00:00:00.000Z",
        updated_at: "2026-08-23T00:00:00.000Z",
      }),
    ).toEqual({
      id: petId,
      name: "보리",
      species: "DOG",
      size: "MEDIUM",
      hasCarrier: true,
      hasLeash: true,
      hasMuzzle: false,
      acceptsOutdoorOnly: true,
      imagePath: `${userId}/${petId}.webp`,
    });
  });

  it("accepts PostgreSQL timestamptz values with an explicit UTC offset", () => {
    expect(
      savedPetProfileFromRow({
        id: petId,
        user_id: userId,
        name: "보리",
        species: "DOG",
        size: "SMALL",
        has_carrier: false,
        has_leash: true,
        has_muzzle: false,
        accepts_outdoor_only: false,
        image_path: null,
        created_at: "2026-08-24T05:45:16.123456+00:00",
        updated_at: "2026-08-24T05:45:16.123456+00:00",
      }),
    ).toMatchObject({
      id: petId,
      name: "보리",
      species: "DOG",
      size: "SMALL",
    });
  });

  it("maps only the allowlisted planner fields to an owner-bound row", () => {
    expect(
      savedPetProfileToRow(
        userId,
        {
          id: petId,
          name: "  보리  ",
          species: "DOG",
          size: "SMALL",
          hasCarrier: false,
          hasLeash: true,
          hasMuzzle: false,
          acceptsOutdoorOnly: false,
        },
        `${userId}/${petId}.jpg`,
      ),
    ).toEqual({
      id: petId,
      user_id: userId,
      name: "보리",
      species: "DOG",
      size: "SMALL",
      has_carrier: false,
      has_leash: true,
      has_muzzle: false,
      accepts_outdoor_only: false,
      image_path: `${userId}/${petId}.jpg`,
    });
  });

  it("builds an update payload without insert-only timestamps", () => {
    const update = savedPetProfileToUpdateRow(userId, {
      id: petId,
      name: "보리",
      species: "DOG",
      size: "SMALL",
      hasCarrier: false,
      hasLeash: true,
      hasMuzzle: false,
      acceptsOutdoorOnly: false,
    }, null);
    expect(update).not.toHaveProperty("created_at");
    expect(update).not.toHaveProperty("id");
    expect(update).not.toHaveProperty("user_id");
    expect(update).toMatchObject({ name: "보리", image_path: null });
  });

  it("rejects invalid database enum values instead of repairing them", () => {
    expect(() =>
      savedPetProfileFromRow({
        id: petId,
        user_id: userId,
        name: "보리",
        species: "BIRD",
        size: "SMALL",
        has_carrier: false,
        has_leash: true,
        has_muzzle: false,
        accepts_outdoor_only: false,
        image_path: null,
        created_at: "2026-08-23T00:00:00.000Z",
        updated_at: "2026-08-23T00:00:00.000Z",
      }),
    ).toThrow();
  });
});
