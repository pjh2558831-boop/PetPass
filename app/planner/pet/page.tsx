import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlannerShell } from "@/components/layout/planner-shell";
import {
  UnifiedPlannerForm,
  type SavedPetPlannerOption,
} from "@/components/planner/unified-planner-form";
import { PET_IMAGE_BUCKET } from "@/lib/auth/pet-image";
import {
  isMissingMultiPetSchemaError,
  savedPetProfileFromLegacyRow,
  savedPetProfileFromRow,
} from "@/lib/auth/pet-profile";
import { createAuthServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "여행 정보 입력",
};
export const dynamic = "force-dynamic";

function toPlannerPetOption(
  savedPet: ReturnType<typeof savedPetProfileFromRow>,
  imageUrl: string | null,
): SavedPetPlannerOption {
  return {
    profile: {
      id: savedPet.id,
      name: savedPet.name,
      species: savedPet.species,
      size: savedPet.size,
      hasCarrier: savedPet.hasCarrier,
      hasLeash: savedPet.hasLeash,
      hasMuzzle: savedPet.hasMuzzle,
      acceptsOutdoorOnly: savedPet.acceptsOutdoorOnly,
    },
    imageUrl,
  };
}

export default async function PetProfilePage() {
  const supabase = await createAuthServerClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  let initialSavedPets: SavedPetPlannerOption[] = [];
  let savedPetsUnavailable = false;

  if (userId) {
    const { data: communityProfile, error: communityProfileError } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", userId)
      .maybeSingle();

    if (communityProfileError || !communityProfile?.onboarding_completed) {
      redirect("/onboarding");
    }

    const { data: petRows, error: petError } = await supabase
      .from("pet_profiles")
      .select("id, user_id, name, species, size, has_carrier, has_leash, has_muzzle, accepts_outdoor_only, image_path, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (petError && isMissingMultiPetSchemaError(petError)) {
      const { data: legacyRows, error: legacyError } = await supabase
        .from("pet_profiles")
        .select("user_id, name, species, size, has_carrier, has_leash, has_muzzle, accepts_outdoor_only, created_at, updated_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      savedPetsUnavailable = Boolean(legacyError);
      initialSavedPets = (legacyRows ?? []).map((row) =>
        toPlannerPetOption(savedPetProfileFromLegacyRow(row), null));
    } else if (petError) {
      savedPetsUnavailable = true;
    } else {
      initialSavedPets = await Promise.all((petRows ?? []).map(async (row) => {
        const savedPet = savedPetProfileFromRow(row);
        const imageUrl = row.image_path
          ? (await supabase.storage.from(PET_IMAGE_BUCKET).createSignedUrl(row.image_path, 3600)).data?.signedUrl ?? null
          : null;
        return toPlannerPetOption(savedPet, imageUrl);
      }));
    }
  }

  return (
    <PlannerShell
      currentStep={1}
      eyebrow="한 번에 입력"
      title="여행 정보 입력"
      description="반려동물 정보와 여행 조건을 한 화면에서 입력하고 바로 맞춤 경로를 추천받으세요."
    >
      <UnifiedPlannerForm
        initialSavedPets={initialSavedPets}
        isSignedIn={Boolean(userId)}
        savedPetsUnavailable={savedPetsUnavailable}
      />
    </PlannerShell>
  );
}
