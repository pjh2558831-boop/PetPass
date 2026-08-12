"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Eye, EyeOff, LoaderCircle, MapPin, Search, Undo2 } from "lucide-react";
import { createKakaoSearchPlan } from "@/lib/kakao/search-area";
import { TOUR_CATALOG_FILTERS, type TourCatalogFilter } from "@/lib/tour-api/catalog";
import type { ApiResult } from "@/types/api";
import {
  KAKAO_DISCOVERY_CATEGORIES,
  type KakaoCurrentMapSearch,
  type KakaoDiscoveryCandidate,
  type KakaoDiscoveryCategory,
  type KakaoDiscoveryResponse,
} from "@/types/kakao";

interface SearchState {
  scopeKey: string;
  loading: boolean;
  searched: boolean;
  error: string;
  results: KakaoDiscoveryCandidate[];
  response?: KakaoDiscoveryResponse;
}

const EMPTY_SEARCH: SearchState = {
  scopeKey: "",
  loading: false,
  searched: false,
  error: "",
  results: [],
};

function isDiscoveryCategory(
  category: TourCatalogFilter,
): category is KakaoDiscoveryCategory {
  return KAKAO_DISCOVERY_CATEGORIES.includes(category as KakaoDiscoveryCategory);
}

export function KakaoPlaceSearch({
  regionId,
  districtCode,
  category,
  currentMapSearch,
  selectedId,
  onSelect,
  onConfiguredAreaSearch,
  showCandidatesOnMap = false,
  onCandidateLayerChange,
  onCandidatesChange,
}: {
  regionId: string;
  districtCode?: string;
  category: TourCatalogFilter;
  currentMapSearch?: KakaoCurrentMapSearch | null;
  selectedId?: string | null;
  onSelect: (result: KakaoDiscoveryCandidate) => void;
  onConfiguredAreaSearch?: () => void;
  showCandidatesOnMap?: boolean;
  onCandidateLayerChange?: (visible: boolean) => void;
  onCandidatesChange?: (results: KakaoDiscoveryCandidate[]) => void;
}) {
  const [searchState, setSearchState] = useState<SearchState>(EMPTY_SEARCH);
  const scopeKey = useMemo(
    () =>
      currentMapSearch
        ? `${category}:viewport:${currentMapSearch.rectangle.west}:${currentMapSearch.rectangle.south}:${currentMapSearch.rectangle.east}:${currentMapSearch.rectangle.north}`
        : `${category}:district:${districtCode ?? "none"}`,
    [category, currentMapSearch, districtCode],
  );
  const activeState =
    searchState.scopeKey === scopeKey ? searchState : EMPTY_SEARCH;
  const supportedCategory = isDiscoveryCategory(category);
  const scopeReady = Boolean(currentMapSearch || districtCode);
  const categoryLabel =
    TOUR_CATALOG_FILTERS.find(({ value }) => value === category)?.label ?? category;
  const areaPreview = useMemo(
    () =>
      createKakaoSearchPlan({
        regionId,
        districtCode,
        explicitMode: currentMapSearch ? "current-map" : "configured",
        currentMap: currentMapSearch,
      }).area,
    [currentMapSearch, districtCode, regionId],
  );

  const search = async () => {
    if (!supportedCategory || !scopeReady) return;
    const controller = new AbortController();
    setSearchState({
      scopeKey,
      loading: true,
      searched: false,
      error: "",
      results: [],
    });
    onCandidatesChange?.([]);
    try {
      const params = new URLSearchParams({ category });
      if (currentMapSearch) {
        params.set("west", String(currentMapSearch.rectangle.west));
        params.set("south", String(currentMapSearch.rectangle.south));
        params.set("east", String(currentMapSearch.rectangle.east));
        params.set("north", String(currentMapSearch.rectangle.north));
        params.set("centerLongitude", String(currentMapSearch.center.longitude));
        params.set("centerLatitude", String(currentMapSearch.center.latitude));
      } else if (districtCode) {
        params.set("districtCode", districtCode);
      }
      const response = await fetch(`/api/places/discovery?${params}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const body = (await response.json()) as ApiResult<KakaoDiscoveryResponse>;
      if (!response.ok || !body.ok) {
        throw new Error(
          body.ok ? "추가 장소 후보 검색에 실패했습니다." : body.error.message,
        );
      }
      onCandidatesChange?.(body.data.candidates);
      setSearchState({
        scopeKey,
        loading: false,
        searched: true,
        error: "",
        results: body.data.candidates,
        response: body.data,
      });
    } catch (error) {
      onCandidatesChange?.([]);
      setSearchState({
        scopeKey,
        loading: false,
        searched: true,
        error:
          error instanceof Error
            ? error.message
            : "추가 장소 후보 검색에 실패했습니다.",
        results: [],
      });
    }
  };

  return (
    <section className="surface-card p-4 sm:p-5" aria-labelledby="kakao-search-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Kakao Local</p>
          <h2 id="kakao-search-heading" className="mt-1 text-lg font-black">
            추가 장소 후보 찾기
          </h2>
        </div>
        <p className="text-xs leading-5 text-[#6b7972]">
          카카오 후보는 일정 추천에 포함되지 않으며 동반 조건을 별도로 확인해야 해요.
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-[#cfd9d3] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-[#748078]">선택한 장소 유형</p>
            <p className="mt-1 text-sm font-black text-[#2a4036]">{categoryLabel}</p>
          </div>
          <button
            type="button"
            disabled={!supportedCategory || !scopeReady || activeState.loading}
            onClick={() => void search()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#236148] px-4 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            {activeState.loading ? (
              <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
            ) : (
              <Search size={17} aria-hidden="true" />
            )}
            {activeState.loading ? "후보 찾는 중" : "추가 후보 찾기"}
          </button>
        </div>
        {!supportedCategory ? (
          <p className="mt-3 text-xs font-bold text-[#76542f]" role="status">
            전체·축제·쇼핑 필터에서는 카카오 추가 후보 검색을 제공하지 않습니다.
          </p>
        ) : !scopeReady ? (
          <p className="mt-3 text-xs font-bold text-[#76542f]" role="status">
            부산 세부 지역을 선택하거나 지도에서 검색 범위를 지정해 주세요.
          </p>
        ) : null}
      </div>

      <div
        className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#edf8f2] px-3 py-2 text-xs font-bold text-[#285c45]"
        aria-live="polite"
      >
        <span>
          활성 검색 범위: {areaPreview.label} · {areaPreview.radiusLabel}
        </span>
        {currentMapSearch && onConfiguredAreaSearch ? (
          <button
            type="button"
            onClick={onConfiguredAreaSearch}
            className="inline-flex min-h-8 items-center gap-1 rounded-full bg-white px-2.5 text-[#236148]"
          >
            <Undo2 size={13} aria-hidden="true" /> 선택 지역으로 복귀
          </button>
        ) : null}
      </div>

      <button
        type="button"
        aria-pressed={showCandidatesOnMap}
        disabled={activeState.results.length === 0}
        onClick={() => onCandidateLayerChange?.(!showCandidatesOnMap)}
        className={`mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-xs font-extrabold disabled:cursor-not-allowed disabled:opacity-45 ${
          showCandidatesOnMap
            ? "border-[#356e85] bg-[#eef6f9] text-[#285b70]"
            : "border-[#d4dde1] bg-white text-[#5f737c]"
        }`}
      >
        {showCandidatesOnMap ? <Eye size={15} aria-hidden="true" /> : <EyeOff size={15} aria-hidden="true" />}
        주변 후보 함께 보기
      </button>

      {activeState.error ? (
        <p role="alert" className="mt-3 rounded-xl bg-[#fceeee] p-3 text-sm font-bold text-[#8d3838]">
          {activeState.error}
        </p>
      ) : null}
      {activeState.searched && !activeState.error && activeState.results.length === 0 ? (
        <p className="mt-3 rounded-xl bg-[#f4f6f4] p-3 text-sm font-semibold text-[#66756d]">
          이 범위에서 검증 대기 중인 추가 후보를 찾지 못했어요.
        </p>
      ) : null}
      {activeState.response?.metadata.partial ? (
        <p className="mt-3 rounded-xl bg-[#fff8f1] p-3 text-xs font-bold text-[#76542f]" role="status">
          안전한 요청 한도 내의 일부 후보만 표시합니다.
        </p>
      ) : null}

      {activeState.results.length > 0 ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {activeState.results.map((result) => {
            const mapId = `kakao-local:${result.id}`;
            const selected = selectedId === mapId;
            return (
              <li key={result.id}>
                <article
                  data-candidate-status={result.candidateStatus}
                  className={`flex h-full flex-col rounded-2xl border p-3 text-left transition ${
                    selected
                      ? "border-[#3d8b68] bg-[#edf8f2]"
                      : "border-[#d8e1dc] bg-white hover:border-[#8caf9d]"
                  }`}
                >
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-[#eef6f9] px-2 py-1 text-[10px] font-extrabold text-[#285b70]">
                      카카오 검색
                    </span>
                    <span className="rounded-full bg-[#fff8f1] px-2 py-1 text-[10px] font-extrabold text-[#76542f]">
                      동반 여부 확인 필요
                    </span>
                  </div>
                  <span className="mt-3 flex items-center gap-2 text-sm font-black">
                    <MapPin size={15} className="shrink-0 text-[#3d8b68]" aria-hidden="true" />
                    {result.name}
                  </span>
                  <span className="mt-1.5 line-clamp-2 block text-xs leading-5 text-[#6b7972]">
                    {result.address}
                  </span>
                  <span className="mt-2 text-[11px] font-bold text-[#68776f]">
                    반려동물 동반 판정: 확인 필요 · 자동 추천 제외
                  </span>
                  {result.exactExistingPlaceLink ? (
                    <span className="mt-2 rounded-xl bg-[#edf8f2] p-2 text-[11px] font-bold leading-5 text-[#285c45]">
                      관광공사 기록과 정확히 연결됨 · 출처는 병합하지 않음
                    </span>
                  ) : null}
                  <div className="mt-auto flex flex-wrap items-center justify-end gap-3 pt-3">
                    <button
                      type="button"
                      onClick={() => onSelect(result)}
                      aria-pressed={selected}
                      className="inline-flex min-h-9 items-center gap-1 text-xs font-extrabold text-[#52665b] hover:text-[#236148]"
                      aria-label={`${result.name} 카카오 검색 장소 지도에서 보기`}
                    >
                      <MapPin size={14} aria-hidden="true" /> 지도
                    </button>
                    {result.placeUrl ? (
                      <a
                        href={result.placeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-9 items-center gap-1 text-xs font-extrabold text-[#285b70]"
                      >
                        카카오 장소 열기 <ExternalLink size={13} aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
