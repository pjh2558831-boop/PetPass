import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlannerProgress } from "@/components/layout/planner-progress";
import { ResultsExplorer } from "@/components/places/results-explorer";
import { parsePublicCatalogUrlState } from "@/lib/map-places/catalog-url";
import { staticMapThumbnailsEnabled } from "@/lib/kakao/static-map";

export const metadata: Metadata = {
  title: "반려동물 장소 찾기",
};

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialCatalogState = parsePublicCatalogUrlState(params);
  if (!initialCatalogState) notFound();
  const itineraryMode = params.mode === "select"
    ? "selection"
    : params.mode === "selected"
      ? "hybrid"
      : "browse";
  const initialTab = itineraryMode === "selection"
    ? "catalog"
    : itineraryMode === "hybrid" || params.tab === "recommendations"
      ? "recommendations"
      : "catalog";
  return (
    <div className="results-route-shell">
      {itineraryMode === "selection" ? (
        <div className="results-route-progress is-selected"><PlannerProgress current={1} variant="selected" /></div>
      ) : initialTab === "recommendations" ? (
        <div className={`results-route-progress ${itineraryMode === "hybrid" ? "is-selected" : ""}`}><PlannerProgress current={itineraryMode === "hybrid" ? 3 : 2} variant={itineraryMode === "hybrid" ? "selected" : "automatic"} /></div>
      ) : null}
      <ResultsExplorer
        initialTab={initialTab}
        initialCatalogState={initialCatalogState}
        staticMapEnabled={staticMapThumbnailsEnabled()}
        itineraryMode={itineraryMode}
      />
    </div>
  );
}
