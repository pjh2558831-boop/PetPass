"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, MapPin, Search } from "lucide-react";
import type { ApiResult } from "@/types/api";
import type { KakaoPlaceSearchResult } from "@/types/kakao";

export function KakaoPlaceSearch({
  selectedId,
  onSelect,
}: {
  selectedId?: string | null;
  onSelect: (result: KakaoPlaceSearchResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KakaoPlaceSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/kakao/local/search?query=${encodeURIComponent(normalized)}&size=5`,
          { signal: controller.signal },
        );
        const body = (await response.json()) as ApiResult<KakaoPlaceSearchResult[]>;
        if (!response.ok || !body.ok) {
          throw new Error(
            body.ok ? "장소 검색에 실패했습니다." : body.error.message,
          );
        }
        setResults(body.data);
        setSearched(true);
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setResults([]);
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
  }, [query]);

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

      {results.length > 0 ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((result) => {
            const mapId = `kakao-local:${result.id}`;
            const selected = selectedId === mapId;
            return (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => onSelect(result)}
                  aria-pressed={selected}
                  className={`h-full w-full rounded-2xl border p-3 text-left transition ${
                    selected
                      ? "border-[#3d8b68] bg-[#edf8f2]"
                      : "border-[#d8e1dc] bg-white hover:border-[#8caf9d]"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-black">
                    <MapPin size={15} className="shrink-0 text-[#3d8b68]" aria-hidden="true" />
                    {result.name}
                  </span>
                  <span className="mt-1.5 line-clamp-2 block text-xs leading-5 text-[#6b7972]">
                    {result.roadAddress ?? result.address}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
