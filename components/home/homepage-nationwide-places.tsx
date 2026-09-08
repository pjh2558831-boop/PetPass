"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HomePlaceWorkbench, HomePlaceWorkbenchError, HomePlaceWorkbenchLoading } from "@/components/home/home-place-workbench";
import { HomeSelectedItineraryTray } from "@/components/home/home-selected-itinerary-tray";
import { useSelectedItinerarySelection } from "@/components/places/use-selected-itinerary-selection";
import { loadNationwideSnapshots, projectNationwideMarker } from "@/lib/homepage/nationwide";
import { getMapEnabledRegionConfigs, getRegionConfig } from "@/lib/regions/config";
import { DEFAULT_PLACE_CATEGORIES, PLACE_CATEGORY_LABELS, type PlaceCategory } from "@/lib/map-places/place-categories";
import type { MapPlacesSnapshot } from "@/types/map-places-snapshot";
import type { SelectedItineraryPlace } from "@/lib/storage/selected-itinerary-storage";
import type { RegionId } from "@/types/region";

const REGIONS = getMapEnabledRegionConfigs().filter((region) => region.mapCatalog.snapshotDatasets.includes("core"));

export function HomepageNationwidePlaces({ staticMapEnabled = false }: { staticMapEnabled?: boolean }) {
  const router = useRouter();
  const [snapshots, setSnapshots] = useState<Partial<Record<RegionId, MapPlacesSnapshot>>>({});
  const retained = useRef(snapshots);
  const [failures, setFailures] = useState<RegionId[]>([]);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [category, setCategory] = useState<PlaceCategory | "all">("all");
  const [regionFilter, setRegionFilter] = useState<RegionId | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionRegion, setSelectionRegion] = useState<RegionId>("busan");
  const selection = useSelectedItinerarySelection({ regionId: selectionRegion, surfaceAddLimit: 3 });

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => loadNationwideSnapshots(REGIONS.map(({ id }) => id).filter((id) => !retained.current[id]), controller.signal,
      (region, snapshot) => {
        retained.current = { ...retained.current, [region]: snapshot };
        setSnapshots(retained.current);
      },
      (region) => setFailures((current) => [...current, region]),
    )).then(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);

  const items = useMemo(() => [...new Map(REGIONS.flatMap(({ id }) => snapshots[id]?.items ?? [])
    .map((item) => [item.id, item])).values()], [snapshots]);
  const markers = useMemo(() => items.flatMap((item) => {
    const marker = projectNationwideMarker(item);
    return marker ? [marker] : [];
  }), [items]);
  const candidates = useMemo(() => new Map(items.map((item) => [item.id, {
    ...item, imageUrl: item.imageUrl ?? null,
  } as SelectedItineraryPlace])), [items]);
  const visible = useMemo(() => markers.filter((marker) =>
    (regionFilter === "all" || marker.regionId === regionFilter) &&
    (category === "all" || marker.category === category)), [markers, regionFilter, category]);
  const focus = (id: string) => {
    setSelectedId(id);
    const place = candidates.get(id);
    if (place && !selection.snapshot.places.length) setSelectionRegion(place.regionId);
  };
  const retryFailed = () => {
    setFailures([]);
    setLoading(true);
    setRetry((value) => value + 1);
  };
  const linkRegion = candidates.get(selectedId ?? "")?.regionId ?? selection.snapshot.regionId;

  return <div className="homepage-live-ready">
    <p className="homepage-workbench-notice" role="status">
      전국 {REGIONS.length}개 시·도 중 {Object.keys(snapshots).length}개 지역 조회{loading ? " 중" : " 완료"}
      {failures.length > 0 ? ` · 연결 실패: ${failures.map((id) => getRegionConfig(id).displayName).join(", ")}` : ""}
      {markers.length < items.length ? ` · 좌표 없는 ${items.length - markers.length}곳은 지역별 목록에서 확인해 주세요.` : ""}
    </p>
    {!Object.keys(snapshots).length ? loading
      ? <HomePlaceWorkbenchLoading regionId={linkRegion} regionLabel="전국" />
      : <HomePlaceWorkbenchError regionId={linkRegion} regionLabel="전국" onRetry={retryFailed}
        error={{ code: "UPSTREAM_ERROR", message: "전국 등록 장소를 불러오지 못했습니다.", retryable: true }} /> :
      <HomePlaceWorkbench
        nationwide
        regionId={linkRegion} regionLabel="전국" markers={visible}
        selectedLocationId={selectedId} onLocationFocus={focus} onMapDataUpdate={() => undefined}
        filterControl={<div className="flex flex-wrap gap-2">
          <label className="text-sm">지역
            <select className="ml-2 min-h-11 rounded border px-2" aria-label="홈 지도 지역" value={regionFilter}
              onChange={(event) => { setRegionFilter(event.target.value as RegionId | "all"); setSelectedId(null); }}>
              <option value="all">전국 전체</option>
              {REGIONS.map(({ id, displayName }) => <option key={id} value={id}>{displayName}</option>)}
            </select>
          </label>
          <label className="text-sm">유형
            <select className="ml-2 min-h-11 rounded border px-2" aria-label="홈 지도 장소 유형" value={category}
              onChange={(event) => { setCategory(event.target.value as PlaceCategory | "all"); setSelectedId(null); }}>
              <option value="all">전체 유형</option>
              {DEFAULT_PLACE_CATEGORIES.map((value) => <option key={value} value={value}>{PLACE_CATEGORY_LABELS[value]}</option>)}
            </select>
          </label>
        </div>}
        selectionSnapshot={selection.snapshot} selectionCandidates={candidates}
        onToggleItinerary={(place) => { selection.toggle(place); }}
        completionState={loading ? "loading" : failures.length ? "partial" : "complete"}
        onRetryCompletion={retryFailed} providerUnavailable={failures.length > 0}
        staticMapEnabled={staticMapEnabled}
      />}
    {selection.snapshot.places.length > 0 ? <HomeSelectedItineraryTray
      snapshot={selection.snapshot} message={selection.message}
      catalogHref={`/results?tab=catalog&region=${selection.snapshot.regionId}&mode=select`}
      onRemove={selection.remove} onMove={selection.move}
      onContinue={() => router.push("/planner/pet?mode=selected")}
    /> : <p className="home-selected-itinerary-guidance">장소를 지도에서 선택한 뒤 일정에 담으세요. 일정에는 같은 지역의 장소를 담을 수 있습니다.</p>}
  </div>;
}
