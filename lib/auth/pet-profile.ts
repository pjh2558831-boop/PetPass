import { z } from "zod";
import { petProfileSchema } from "@/lib/shared/domain-schemas";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";
import type { PetProfile } from "@/types/pet";

const savedPetProfileRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().trim().min(1).max(30),
  species: z.enum(["DOG", "CAT", "OTHER"]),
  size: z.enum(["SMALL", "MEDIUM", "LARGE"]),
  has_carrier: z.boolean(),
  has_leash: z.boolean(),
  has_muzzle: z.boolean(),
  accepts_outdoor_only: z.boolean(),
  image_path: z.string().min(1).max(512).nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const savedPetProfileInputSchema = petProfileSchema
  .omit({ id: true })
  .strict();

export type SavedPetProfile = PetProfile & {
  imagePath: string | null;
};

export function savedPetProfileFromRow(row: unknown): SavedPetProfile {
  const parsed = savedPetProfileRowSchema.parse(row);
  const profile = petProfileSchema.parse({
    id: parsed.id,
    name: parsed.name,
    species: parsed.species,
    size: parsed.size,
    hasCarrier: parsed.has_carrier,
    hasLeash: parsed.has_leash,
    hasMuzzle: parsed.has_muzzle,
    acceptsOutdoorOnly: parsed.accepts_outdoor_only,
  });
  return { ...profile, imagePath: parsed.image_path };
}

export function savedPetProfileToRow(
  userId: string,
  profile: PetProfile,
  imagePath: string | null = null,
): TablesInsert<"pet_profiles"> {
  const ownerId = z.string().uuid().parse(userId);
  const parsed = petProfileSchema.parse(profile);
  const parsedImagePath = z
    .string()
    .max(512)
    .refine((path) => path.startsWith(`${ownerId}/`), "반려동물 이미지 경로가 올바르지 않습니다.")
    .nullable()
    .parse(imagePath);
  return {
    id: parsed.id,
    user_id: ownerId,
    name: parsed.name,
    species: parsed.species,
    size: parsed.size,
    has_carrier: parsed.hasCarrier,
    has_leash: parsed.hasLeash,
    has_muzzle: parsed.hasMuzzle,
    accepts_outdoor_only: parsed.acceptsOutdoorOnly,
    image_path: parsedImagePath,
  };
}

export function savedPetProfileToUpdateRow(
  userId: string,
  profile: PetProfile,
  imagePath: string | null,
): TablesUpdate<"pet_profiles"> {
  const row = savedPetProfileToRow(userId, profile, imagePath);
  return {
    name: row.name,
    species: row.species,
    size: row.size,
    has_carrier: row.has_carrier,
    has_leash: row.has_leash,
    has_muzzle: row.has_muzzle,
    accepts_outdoor_only: row.accepts_outdoor_only,
    image_path: row.image_path,
  };
}

export type SavedPetProfileRow = Tables<"pet_profiles">;
