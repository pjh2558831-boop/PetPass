"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Eye, EyeOff, LoaderCircle, MapPin, Search, Undo2 } from "lucide-react";
import { createKakaoSearchPlan } from "@/lib/kakao/search-area";
import { findBestProviderLink } from "@/lib/places/source-linking";
import type { ApiResult } from "@/types/api";
import type {
  KakaoCurrentMapSearch,
  KakaoDiscoveryCandidate,
  KakaoLocalSearchResponse,
} from "@/types/kakao";
import type { PlaceSourceRecord } from "@/types/place-source";

export function KakaoPlaceSearch({
  regionId,
  districtCode,
  currentMapSearch,
  selectedId,
  onSelect,
  onConfiguredAreaSearch,
  officialSources = [],
  showCandidatesOnMap = false,
  onCandidateLayerChange,
  onCandidatesChange,
}: {
  regionId: string;
  districtCode?: string;
  currentMapSearch?: KakaoCurrentMapSearch | null;
  selectedId?: string | null;
  onSelect: (result: KakaoDiscoveryCandidate) => void;
  onConfiguredAreaSearch?: () => void;
  officialSources?: PlaceSourceRecord[];
  showCandidatesOnMap?: boolean;
  onCandidateLayerChange?: (visible: boolean) => void;
  onCandidatesChange?: (results: KakaoDiscoveryCandidate[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KakaoDiscoveryCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [searchMeta, setSearchMeta] = useState<
    Pick<KakaoLocalSearchResponse, "area" | "truncated"> & { scopeKey: string } | undefined
  >();
  const onCandidatesChangeRef = useRef(onCandidatesChange);
  useEffect(() => {
    onCandidatesChangeRef.current = onCandidatesChange;
  }, [onCandidatesChange]);
  const scopeKey = useMemo(
    () =>
      currentMapSearch
        ? `${regionId}:current:${currentMapSearch.center.longitude}:${currentMapSearch.center.latitude}:${currentMapSearch.radiusMeters}`
        : `${regionId}:configured:${districtCode ?? "all"}`,
    [currentMapSearch, districtCode, regionId],
  );
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

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          query: normalized,
          size: "5",
          regionId,
          mode: currentMapSearch ? "current-map" : "configured",
        });
        if (districtCode) params.set("districtCode", districtCode);
        if (currentMapSearch) {
          params.set("longitude", String(currentMapSearch.center.longitude));
          params.set("latitude", String(currentMapSearch.center.latitude));
          params.set("radiusMeters", String(currentMapSearch.radiusMeters));
        }
        const response = await fetch(`/api/kakao/local/search?${params}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as ApiResult<KakaoLocalSearchResponse>;
        if (!response.ok || !body.ok) {
          throw new Error(
            body.ok ? "장소 검색에 실패했습니다." : body.error.message,
          );
        }
        setResults(body.data.results);
        onCandidatesChangeRef.current?.(body.data.results);
        setSearchMeta({
          area: body.data.area,
          truncated: body.data.truncated,
          scopeKey,
        });
        setSearched(true);
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setResults([]);
        onCandidatesChangeRef.current?.([]);
        setSearchMeta(undefined);
        setSearched(true);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "장소 검색에 실패했습니다.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [currentMapSearch, districtCode, query, regionId, scopeKey]);

  return (
    <section className="surface-card p-4 sm:p-5" aria-labelledby="kakao-search-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Kakao Local</p>
          <h2 id="kakao-search-heading" className="mt-1 text-lg font-black">
            주변 장소 직접 찾기
          </h2>
        </div>
        <p className="text-xs leading-5 text-[#6b7972]">
          선택한 결과는 지도에 표시되며, 반려동물 동반 조건은 별도 확인이 필요해요.
        </p>
      </div>

      <div className="relative mt-4">
        <Search
          size={18}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6d7d74]"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            if (value.trim().length < 2) {
              setResults([]);
              onCandidatesChangeRef.current?.([]);
              setLoading(false);
              setSearched(false);
              setError("");
            }
          }}
          placeholder="예: 부산 카페, 기장 산책"
          className="min-h-12 w-full rounded-2xl border border-[#cfd9d3] bg-white py-3 pl-11 pr-12 text-sm font-semibold shadow-sm"
          aria-label="카카오 장소 검색"
          aria-describedby="kakao-search-help"
        />
        {loading ? (
          <LoaderCircle
            size={18}
            className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-[#3d8b68]"
            aria-label="장소 검색 중"
          />
        ) : null}
      </div>
      <p id="kakao-search-help" className="mt-2 text-xs text-[#748078]">
        두 글자 이상 입력하면 0.35초 후 입력한 지역명과 장소명으로 검색합니다.
      </p>
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
        disabled={results.length === 0}
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

      {error ? (
        <p role="alert" className="mt-3 rounded-xl bg-[#fceeee] p-3 text-sm font-bold text-[#8d3838]">
          {error}
        </p>
      ) : null}

      {searched && !loading && !error && results.length === 0 ? (
        <p className="mt-3 rounded-xl bg-[#f4f6f4] p-3 text-sm font-semibold text-[#66756d]">
          검색 결과가 없어요. 장소명이나 지역명을 바꿔보세요.
        </p>
      ) : null}

      {searched &&
      !loading &&
      !error &&
      searchMeta?.scopeKey === scopeKey &&
      searchMeta.truncated ? (
        <p className="mt-3 rounded-xl bg-[#fff8f1] p-3 text-xs font-bold text-[#76542f]" role="status">
          카카오 요청 제한 내의 일부 결과만 표시합니다. 더 정확한 장소명을 입력해 주세요.
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((result) => {
            const mapId = `kakao-local:${result.id}`;
            const selected = selectedId === mapId;
            const link = findBestProviderLink(result.sourceRecord, officialSources);
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
                      카카오 검색 후보
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
                    {result.roadAddress ?? result.address}
                  </span>
                  <span className="mt-2 text-[11px] font-bold text-[#68776f]">
                    정보 신뢰도: 낮음 · 확률 또는 동반 판정 아님
                  </span>
                  {link ? (
                    <span className={`mt-2 rounded-xl p-2 text-[11px] font-bold leading-5 ${
                      link.classification === "exact"
                        ? "bg-[#edf8f2] text-[#285c45]"
                        : "bg-[#fff8f1] text-[#76542f]"
                    }`}>
                      {link.classification === "exact"
                        ? "관광공사 기록과 정확히 연결됨 · 출처 2개 보존"
                        : `동일 장소 ${link.classification === "probable" ? "유력" : "가능"} · 관리자 검토 필요`}
                      {link.conflicts.length > 0
                        ? ` · 출처 충돌 ${link.conflicts.length}건`
                        : ""}
                    </span>
                  ) : null}
                  <div className="mt-auto flex flex-wrap items-center justify-end gap-3 pt-3">
                    <button
                      type="button"
                      onClick={() => onSelect(result)}
                      aria-pressed={selected}
                      className="inline-flex min-h-9 items-center gap-1 text-xs font-extrabold text-[#52665b] hover:text-[#236148]"
                      aria-label={`${result.name} 카카오 검색 후보 지도에서 보기`}
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
