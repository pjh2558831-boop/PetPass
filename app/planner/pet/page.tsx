import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlannerShell } from "@/components/layout/planner-shell";
import { UnifiedPlannerForm } from "@/components/planner/unified-planner-form";
import { createAuthServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "여행 정보 입력",
};
export const dynamic = "force-dynamic";

export default async function PetProfilePage() {
  const supabase = await createAuthServerClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (userId) {
    const { data: communityProfile, error: communityProfileError } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", userId)
      .maybeSingle();

    if (communityProfileError || !communityProfile?.onboarding_completed) {
      redirect("/onboarding");
    }
  }

  return (
    <PlannerShell
      currentStep={1}
      eyebrow="한 번에 입력"
      title="여행 정보 입력"
      description="반려동물 정보와 여행 조건을 한 화면에서 입력하고 바로 맞춤 경로를 추천받으세요."
    >
      <UnifiedPlannerForm />
    </PlannerShell>
  );
}
