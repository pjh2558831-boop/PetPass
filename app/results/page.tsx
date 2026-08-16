import type { Metadata } from "next";
import { PlannerProgress } from "@/components/layout/planner-progress";
import { ResultsExplorer } from "@/components/places/results-explorer";
import { parsePublicCatalogUrlState } from "@/lib/map-places/catalog-url";

export const metadata: Metadata = {
  title: "부산 장소 찾기",
};

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialCatalogState = parsePublicCatalogUrlState(params);
  return (
    <div className="results-route-shell">
      <div className="results-route-progress"><PlannerProgress current={2} /></div>
      <ResultsExplorer
        initialTab={params.tab === "recommendations" ? "recommendations" : "catalog"}
        initialCatalogState={initialCatalogState}
      />
    </div>
  );
}
