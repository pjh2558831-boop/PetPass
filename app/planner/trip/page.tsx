import type { Metadata } from "next";
import { PlannerShell } from "@/components/layout/planner-shell";
import { TripPreferencesForm } from "@/components/planner/trip-preferences-form";

export const metadata: Metadata = {
  title: "여행 조건",
};

export default function TripPreferencesPage() {
  return (
    <PlannerShell
      currentStep={2}
      eyebrow="Step 2"
      title="이번 여행의 범위와 리듬을 정해요."
      description="검증된 출발지와 일정 조건을 입력하면 한국관광공사 동반 근거를 확인한 실제 장소로 경로를 만듭니다."
    >
      <TripPreferencesForm />
    </PlannerShell>
  );
}
