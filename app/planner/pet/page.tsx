import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlannerShell } from "@/components/layout/planner-shell";
import { UnifiedPlannerForm } from "@/components/planner/unified-planner-form";
import { savedPetProfileFromRow } from "@/lib/auth/pet-profile";
import { createAuthServerClient } from "@/lib/supabase/server";
import type { PetProfile } from "@/types/pet";

export const metadata: Metadata = {
  title: "여행 정보 입력",
};
export const dynamic = "force-dynamic";

export default async function PetProfilePage() {
  const supabase = await createAuthServerClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  let initialPetProfile: PetProfile | null = null;

  if (userId) {
    const { data: communityProfile, error: communityProfileError } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", userId)
      .maybeSingle();

    if (communityProfileError || !communityProfile?.onboarding_completed) {
      redirect("/onboarding");
    }

    const { data: savedPet, error: savedPetError } = await supabase
      .from("pet_profiles")
      .select("user_id, name, species, size, has_carrier, has_leash, has_muzzle, accepts_outdoor_only, created_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (savedPetError) {
      throw new Error("저장된 반려동물 정보를 불러오지 못했습니다.");
    }
    if (savedPet) initialPetProfile = savedPetProfileFromRow(savedPet);
  }

  return (
    <PlannerShell
      currentStep={1}
      eyebrow="한 번에 입력"
      title="여행 정보 입력"
      description="반려동물 정보와 여행 조건을 한 화면에서 입력하고 바로 맞춤 경로를 추천받으세요."
    >
      <UnifiedPlannerForm
        initialPetProfile={initialPetProfile}
        isAuthenticated={Boolean(userId)}
      />
    </PlannerShell>
  );
}
