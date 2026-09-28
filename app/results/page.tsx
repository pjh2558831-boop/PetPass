import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResultsExplorer } from "@/components/places/results-explorer";
import { parsePublicCatalogUrlState } from "@/lib/map-places/catalog-url";
import { staticMapThumbnailsEnabled } from "@/lib/kakao/static-map";

export const metadata: Metadata = {
  title: "반려동물 장소 찾기",
  alternates: { canonical: "/results" },
  robots: { index: false, follow: true },
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
      <ResultsExplorer
        initialTab={initialTab}
        initialCatalogState={initialCatalogState}
        staticMapEnabled={staticMapThumbnailsEnabled()}
        itineraryMode={itineraryMode}
        replacementPlaceId={typeof params.replace === "string" ? params.replace : null}
      />
    </div>
  );
}
