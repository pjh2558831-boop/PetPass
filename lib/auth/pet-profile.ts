import { z } from "zod";
import { petProfileSchema } from "@/lib/shared/domain-schemas";
import type { Tables, TablesInsert } from "@/types/database";
import type { PetProfile } from "@/types/pet";

const savedPetProfileRowSchema = z.object({
  user_id: z.string().uuid(),
  name: z.string().trim().min(1).max(30),
  species: z.enum(["DOG", "CAT", "OTHER"]),
  size: z.enum(["SMALL", "MEDIUM", "LARGE"]),
  has_carrier: z.boolean(),
  has_leash: z.boolean(),
  has_muzzle: z.boolean(),
  accepts_outdoor_only: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const savedPetProfileInputSchema = petProfileSchema
  .omit({ id: true })
  .strict();

export function savedPetProfileFromRow(row: unknown): PetProfile {
  const parsed = savedPetProfileRowSchema.parse(row);
  return petProfileSchema.parse({
    id: parsed.user_id,
    name: parsed.name,
    species: parsed.species,
    size: parsed.size,
    hasCarrier: parsed.has_carrier,
    hasLeash: parsed.has_leash,
    hasMuzzle: parsed.has_muzzle,
    acceptsOutdoorOnly: parsed.accepts_outdoor_only,
  });
}

export function savedPetProfileToRow(
  userId: string,
  profile: PetProfile,
): TablesInsert<"pet_profiles"> {
  const ownerId = z.string().uuid().parse(userId);
  const parsed = petProfileSchema.parse(profile);
  return {
    user_id: ownerId,
    name: parsed.name,
    species: parsed.species,
    size: parsed.size,
    has_carrier: parsed.hasCarrier,
    has_leash: parsed.hasLeash,
    has_muzzle: parsed.hasMuzzle,
    accepts_outdoor_only: parsed.acceptsOutdoorOnly,
  };
}

export type SavedPetProfileRow = Tables<"pet_profiles">;
