import type { Metadata } from "next";
import { PlannerProgress } from "@/components/layout/planner-progress";
import { ResultsExplorer } from "@/components/places/results-explorer";
import { parsePublicCatalogUrlState } from "@/lib/map-places/catalog-url";

export const metadata: Metadata = {
  title: "추천 경로 비교",
};

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialCatalogState = parsePublicCatalogUrlState(params);
  return (
    <div className="page-shell py-8 sm:py-12 lg:py-14">
      <PlannerProgress current={2} />
      <div className="mt-8 sm:mt-10">
        <ResultsExplorer
          initialTab={params.tab === "recommendations" ? "recommendations" : "catalog"}
          initialCatalogState={initialCatalogState}
        />
      </div>
    </div>
  );
}
