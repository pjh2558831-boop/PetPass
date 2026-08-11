import type { Metadata } from "next";
import { PlannerShell } from "@/components/layout/planner-shell";
import { UnifiedPlannerForm } from "@/components/planner/unified-planner-form";

export const metadata: Metadata = {
  title: "여행 정보 입력",
};

export default function PetProfilePage() {
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
