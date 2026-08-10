import type { Metadata } from "next";
import { PlannerShell } from "@/components/layout/planner-shell";
import { PetProfileForm } from "@/components/planner/pet-profile-form";

export const metadata: Metadata = {
  title: "반려동물 프로필",
};

export default function PetProfilePage() {
  return (
    <PlannerShell
      currentStep={1}
      eyebrow="Step 1"
      title="함께 여행할 반려동물을 알려주세요."
      description="시설의 원문 동반 규정과 비교할 기본 조건을 입력해 주세요. 값은 이 여행을 만드는 동안에만 유지됩니다."
    >
      <PetProfileForm />
    </PlannerShell>
  );
}
