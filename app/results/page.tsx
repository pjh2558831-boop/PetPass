import type { Metadata } from "next";
import { PlannerProgress } from "@/components/layout/planner-progress";
import { ResultsExplorer } from "@/components/places/results-explorer";

export const metadata: Metadata = {
  title: "추천 경로",
};

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
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
          한국관광공사 실시간 장소와 반려동물 동반 원문을 확인하고, 조건을
          충족하는 후보만 카카오 실제 이동 경로로 계산합니다.
        </p>
      </div>
      <div className="mt-8">
        <ResultsExplorer initialTab={tab === "recommendations" ? "recommendations" : "catalog"} />
      </div>
    </div>
  );
}
