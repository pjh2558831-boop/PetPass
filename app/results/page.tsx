import type { Metadata } from "next";
import { PlannerProgress } from "@/components/layout/planner-progress";
import { ResultsExplorer } from "@/components/places/results-explorer";

export const metadata: Metadata = {
  title: "추천 경로 비교",
};

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return (
    <div className="page-shell py-8 sm:py-12 lg:py-14">
      <PlannerProgress current={2} />
      <div className="mt-8 sm:mt-10">
        <ResultsExplorer initialTab={tab === "recommendations" ? "recommendations" : "catalog"} />
      </div>
    </div>
  );
}
