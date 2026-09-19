"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { HomePlaceWorkbench } from "@/components/home/home-place-workbench";
import { HomeSelectedItineraryTray } from "@/components/home/home-selected-itinerary-tray";
import { useSelectedItinerarySelection } from "@/components/places/use-selected-itinerary-selection";
import { HOMEPAGE_MAP_REGIONS, HOMEPAGE_NATIONWIDE_BOUNDS, HOMEPAGE_REGION_LOCATIONS, homepageRegionForViewport, projectNationwideMarker } from "@/lib/homepage/nationwide";
import { mapPlacesSnapshotBrowserClient } from "@/lib/map-places/snapshot-client";
import { getRegionConfig } from "@/lib/regions/config";
import { DEFAULT_PLACE_CATEGORIES, PLACE_CATEGORY_LABELS, type PlaceCategory } from "@/lib/map-places/place-categories";
import type { MapPanelProps } from "@/components/map/map-panel";
import type { MapPlacesSnapshot } from "@/types/map-places-snapshot";
import type { SelectedItineraryPlace } from "@/lib/storage/selected-itinerary-storage";
import type { HomeSearchRequest } from "./homepage-landing";
import type { RegionId } from "@/types/region";

export function HomepageNationwidePlaces({ staticMapEnabled = false, searchRequest }: { staticMapEnabled?: boolean; searchRequest?: HomeSearchRequest }) {
  const router = useRouter();
  const [activeRegion, setActiveRegion] = useState<RegionId | null>(searchRequest?.regionId ?? null);
  const [cameraBounds, setCameraBounds] = useState(searchRequest ? getRegionConfig(searchRequest.regionId).mapBounds : HOMEPAGE_NATIONWIDE_BOUNDS);
  const [result, setResult] = useState<{ key: string; data?: MapPlacesSnapshot; failed?: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const [category, setCategory] = useState<PlaceCategory | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selection = useSelectedItinerarySelection({ regionId: activeRegion ?? "busan", surfaceAddLimit: 3 });
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastViewport = useRef("");
  const requestKey = `${activeRegion}:${retry}`;
  useEffect(() => {
    if (!activeRegion) return;
    const controller = new AbortController();
    void mapPlacesSnapshotBrowserClient.load(activeRegion, "core", controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ key: requestKey, data });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key: requestKey, failed: true });
    });
    return () => controller.abort();
  }, [activeRegion, requestKey]);
  useEffect(() => () => { if (viewportTimer.current) clearTimeout(viewportTimer.current); }, [searchRequest]);
  const chooseRegion = (region: RegionId | null) => {
    if (viewportTimer.current) clearTimeout(viewportTimer.current);
    setActiveRegion(region);
    setSelectedId(null);
    setCameraBounds({ ...(region ? getRegionConfig(region).mapBounds : HOMEPAGE_NATIONWIDE_BOUNDS) });
  };
  const onViewportIdle = useCallback<NonNullable<MapPanelProps["onViewportIdle"]>>((viewport, cause, level) => {
    const key = `${level}:${viewport.center.latitude.toFixed(5)}:${viewport.center.longitude.toFixed(5)}`;
    const unchanged = lastViewport.current === key;
    lastViewport.current = key;
    if (cause !== "user" || unchanged) return;
    if (viewportTimer.current) clearTimeout(viewportTimer.current);
    viewportTimer.current = setTimeout(() => {
      const region = homepageRegionForViewport(viewport, level);
      setActiveRegion(current => current === region ? current : region);
    }, 250);
  }, []);
  const [appliedSearch, setAppliedSearch] = useState(searchRequest);
  if (searchRequest && appliedSearch !== searchRequest) {
    setAppliedSearch(searchRequest);
    setActiveRegion(searchRequest.regionId);
    setCameraBounds({ ...getRegionConfig(searchRequest.regionId).mapBounds });
    setSelectedId(null);
  }
  const data = activeRegion && result?.key === requestKey ? result.data : undefined;
  const failed = Boolean(activeRegion && result?.key === requestKey && result.failed);
  const loading = Boolean(activeRegion && !data && !failed);
  const markers = useMemo(() => (data?.items ?? []).flatMap(item => {
    const marker = projectNationwideMarker(item);
    return marker ? [marker] : [];
  }), [data]);
  const candidates = useMemo(() => new Map((data?.items ?? []).map(item => [item.id, {
    ...item, imageUrl: item.imageUrl ?? null,
  } as SelectedItineraryPlace])), [data]);
  const visible = useMemo(() => markers.filter(marker => category === "all" || marker.category === category), [markers, category]);
  const focus = (id: string) => {
    setSelectedId(id);
  };
  const regionLabel = activeRegion ? getRegionConfig(activeRegion).displayName : "전국";
  const retryFailed = () => setRetry(value => value + 1);
  const overview = !activeRegion;
  const listContent = overview ? <div className="home-region-overview">
    <p>지역을 선택하거나 지도를 확대해 장소를 확인하세요.</p>
    <div>{HOMEPAGE_MAP_REGIONS.map(region => <button key={region.id} type="button" onClick={() => chooseRegion(region.id)}>{region.displayName} <span aria-hidden="true">↗</span></button>)}</div>
  </div> : loading ? <p className="home-region-overview" role="status">{regionLabel} 장소를 불러오는 중입니다.</p>
    : failed ? <div className="home-region-overview" role="status"><p>{regionLabel} 장소를 불러오지 못했습니다.</p><button type="button" onClick={retryFailed}>다시 시도</button></div> : undefined;
  return <div className="homepage-live-ready" data-active-region={activeRegion ?? "overview"}>
    <HomePlaceWorkbench
      nationwide searchRequest={searchRequest}
      regionId={activeRegion ?? "busan"} regionLabel={regionLabel} markers={visible}
      selectedLocationId={selectedId} onLocationFocus={focus} onMapDataUpdate={() => undefined}
      regionalMap={{ overviewLocations: overview ? HOMEPAGE_REGION_LOCATIONS : undefined,
        onRegionSelect: id => { const region = HOMEPAGE_MAP_REGIONS.find(region => region.id === id); if (region) chooseRegion(region.id); },
        onViewportIdle, focusBounds: cameraBounds,
        countLabel: overview ? `${HOMEPAGE_MAP_REGIONS.length}개 지역` : loading ? "불러오는 중" : failed ? "조회 실패" : `${visible.length.toLocaleString("ko-KR")}곳`,
        listContent,
        regionControl: <nav className="homepage-region-rail" aria-label="지역 선택">
          <button type="button" aria-pressed={overview} onClick={() => chooseRegion(null)}><span aria-hidden="true">▦</span>전체</button>
          {HOMEPAGE_MAP_REGIONS.map(region => <button key={region.id} type="button" aria-pressed={activeRegion === region.id} onClick={() => chooseRegion(region.id)}><span aria-hidden="true">⌖</span>{region.displayName}</button>)}
        </nav>,
      }}
      filterControl={<details className="home-map-filters"><summary><SlidersHorizontal size={18} aria-hidden="true" /> 필터</summary><div className="home-map-filters__fields flex flex-wrap gap-2">
        <label className="text-sm">지역<select className="ml-2 min-h-11 rounded border px-2" aria-label="홈 지도 지역" value={activeRegion ?? "all"}
          onChange={event => chooseRegion(event.target.value === "all" ? null : event.target.value as RegionId)}>
          <option value="all">전국 지역 보기</option>{HOMEPAGE_MAP_REGIONS.map(region => <option key={region.id} value={region.id}>{region.displayName}</option>)}
        </select></label>
        <label className="text-sm">유형<select className="ml-2 min-h-11 rounded border px-2" aria-label="홈 지도 장소 유형" value={category}
          onChange={event => { setCategory(event.target.value as PlaceCategory | "all"); setSelectedId(null); }}>
          <option value="all">전체 유형</option>{DEFAULT_PLACE_CATEGORIES.map(value => <option key={value} value={value}>{PLACE_CATEGORY_LABELS[value]}</option>)}
        </select></label>
      </div></details>}
      selectionSnapshot={selection.snapshot} selectionCandidates={candidates} onToggleItinerary={place => selection.toggle(place)}
      completionState="complete" onRetryCompletion={retryFailed} providerUnavailable={false} staticMapEnabled={staticMapEnabled}
    />
    {data && markers.length < data.items.length && <p className="homepage-workbench-notice">좌표 없는 {data.items.length - markers.length}곳은 지역별 목록에서 확인해 주세요.</p>}
    {selection.snapshot.places.length > 0 ? <HomeSelectedItineraryTray snapshot={selection.snapshot} message={selection.message}
      catalogHref={`/results?tab=catalog&region=${selection.snapshot.regionId}&mode=select`}
      onRemove={selection.remove} onMove={selection.move}
      onClear={() => selection.resetRegion(selection.snapshot.regionId, { preserveAutoFill: true, message: "선택한 장소를 모두 비웠습니다." })}
      onContinue={() => router.push("/planner/pet?mode=selected")} />
      : <p className="home-selected-itinerary-guidance">지역에서 장소를 선택해 일정에 담으세요. 일정에는 같은 지역의 장소를 담을 수 있습니다.</p>}
  </div>;
}
