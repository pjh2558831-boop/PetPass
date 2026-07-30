import type { Metadata } from "next";
import { PlannerProgress } from "@/components/layout/planner-progress";
import { TripPreferencesForm } from "@/components/planner/trip-preferences-form";

export const metadata: Metadata = {
  title: "여행 조건",
};

export default function TripPreferencesPage() {
  return (
    <div className="page-shell py-10 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <PlannerProgress current={2} />
        <div className="mt-10">
          <p className="eyebrow">Step 2</p>
          <h1 className="balance mt-3 text-3xl font-black tracking-[-0.045em] sm:text-4xl">
            이번 여행의 범위와 리듬을 정해요.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#65746c]">
            지금은 부산 당일치기 데모 흐름을 지원해요. 숙소 유형은 데이터
            모델에 포함되어 다음 1박 일정으로 확장할 수 있어요.
          </p>
        </div>
        <div className="surface-card mt-8 p-5 sm:p-8">
          <TripPreferencesForm />
        </div>
      </div>
    </div>
  );
}
