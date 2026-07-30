import type { Metadata } from "next";
import { PlannerProgress } from "@/components/layout/planner-progress";
import { ResultsExplorer } from "@/components/places/results-explorer";

export const metadata: Metadata = {
  title: "추천 경로",
};

export default function ResultsPage() {
  return (
    <div className="page-shell py-8 sm:py-12">
      <PlannerProgress current={3} />
      <div className="mt-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Busan day trip</p>
          <h1 className="balance mt-2 text-3xl font-black tracking-[-0.045em] sm:text-4xl">
            바다를 따라 여유롭게,
            <br />
            조건까지 맞춘 하루예요.
          </h1>
        </div>
        <p className="max-w-md text-sm leading-7 text-[#66766e]">
          장소의 운영시간, 동반 규정과 카테고리 균형을 반영한 로컬 데모
          결과예요. 실제 데이터 연결 전에는 모든 장소를 데모로 표시합니다.
        </p>
      </div>
      <div className="mt-8">
        <ResultsExplorer />
      </div>
    </div>
  );
}
