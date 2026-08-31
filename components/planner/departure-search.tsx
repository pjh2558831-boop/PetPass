"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, MapPin, Search, X } from "lucide-react";
import type { KakaoDepartureSearchResult } from "@/types/kakao";
import type { ResolvedDeparture } from "@/types/pet";

type SearchStatus = "idle" | "loading" | "ready" | "empty" | "error";

function parseDepartureResults(value: unknown): KakaoDepartureSearchResult[] | null {
  if (!Array.isArray(value)) return null;
  const results: KakaoDepartureSearchResult[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Record<string, unknown>;
    const coordinates = candidate.coordinates as Record<string, unknown> | undefined;
    const latitude = coordinates?.latitude;
    const longitude = coordinates?.longitude;
    if (
      typeof candidate.id !== "string" ||
      (candidate.kind !== "place" && candidate.kind !== "address") ||
      typeof candidate.label !== "string" ||
      candidate.label.length === 0 ||
      candidate.label.length > 150 ||
      typeof candidate.address !== "string" ||
      candidate.address.length > 200 ||
      typeof latitude !== "number" ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      typeof longitude !== "number" ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      return null;
    }
    results.push({
      id: candidate.id,
      kind: candidate.kind,
      label: candidate.label,
      address: candidate.address,
      coordinates: { latitude, longitude },
    });
  }
  return results;
}

function selectedDeparture(result: KakaoDepartureSearchResult): ResolvedDeparture {
  return {
    label: result.label.trim(),
    source:
      result.kind === "place" ? "kakao_place_search" : "address_search",
    coordinates: result.coordinates,
  };
}

export function DepartureSearch({
  value,
  onChange,
  invalid = false,
  errorId,
}: {
  value?: ResolvedDeparture;
  onChange: (value: ResolvedDeparture | undefined) => void;
  invalid?: boolean;
  errorId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestSequenceRef = useRef(0);
  const [query, setQuery] = useState(value?.label ?? "");
  const [results, setResults] = useState<KakaoDepartureSearchResult[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = "departure-search-results";

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2 || trimmedQuery === value?.label) return;

    const requestSequence = ++requestSequenceRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ query: trimmedQuery, size: "5" });
        const response = await fetch(`/api/kakao/local/departure?${params}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as unknown;
        if (controller.signal.aborted || requestSequence !== requestSequenceRef.current) {
          return;
        }
        if (!body || typeof body !== "object") {
          throw new Error("출발지 검색 응답 형식을 확인할 수 없습니다.");
        }
        const apiResult = body as Record<string, unknown>;
        if (!response.ok || apiResult.ok !== true) {
          const error = apiResult.error as Record<string, unknown> | undefined;
          throw new Error(
            typeof error?.message === "string"
              ? error.message
              : "출발지를 검색하지 못했습니다.",
          );
        }
        const parsedResults = parseDepartureResults(apiResult.data);
        if (!parsedResults) {
          throw new Error("출발지 검색 응답 형식을 확인할 수 없습니다.");
        }
        setResults(parsedResults);
        setStatus(parsedResults.length > 0 ? "ready" : "empty");
        setMessage(
          parsedResults.length > 0
            ? `${parsedResults.length}개의 장소와 주소를 찾았습니다.`
            : "일치하는 장소나 주소가 없습니다. 장소명 또는 주소를 다시 확인해 주세요.",
        );
        setActiveIndex(-1);
        setOpen(true);
      } catch (error) {
        if (controller.signal.aborted || requestSequence !== requestSequenceRef.current) {
          return;
        }
        setResults([]);
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "출발지를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
        setActiveIndex(-1);
        setOpen(true);
      }
    }, 320);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, value?.label]);

  const chooseResult = (result: KakaoDepartureSearchResult) => {
    const departure = selectedDeparture(result);
    setQuery(departure.label);
    setResults([]);
    setStatus("idle");
    setMessage("");
    setOpen(false);
    setActiveIndex(-1);
    onChange(departure);
  };

  const updateQuery = (nextQuery: string) => {
    requestSequenceRef.current += 1;
    setQuery(nextQuery);
    setResults([]);
    setActiveIndex(-1);
    setMessage("");
    if (value && nextQuery !== value.label) onChange(undefined);
    if (nextQuery.trim().length >= 2) {
      setStatus("loading");
      setOpen(true);
    } else {
      setStatus("idle");
      setOpen(false);
    }
  };

  const clearSelection = () => {
    requestSequenceRef.current += 1;
    setQuery("");
    setResults([]);
    setStatus("idle");
    setMessage("");
    setOpen(false);
    setActiveIndex(-1);
    onChange(undefined);
    inputRef.current?.focus();
  };

  return (
    <div>
      <label htmlFor="departure-search" className="mb-2 block text-sm font-extrabold">
        출발지
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--brand)]"
          size={18}
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id="departure-search"
          role="combobox"
          type="search"
          value={query}
          autoComplete="off"
          placeholder="역, 관광지, 도로명 주소로 검색"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            open && activeIndex >= 0 ? `departure-option-${activeIndex}` : undefined
          }
          aria-invalid={invalid}
          aria-describedby={["departure-search-help", errorId].filter(Boolean).join(" ")}
          onChange={(event) => updateQuery(event.target.value)}
          onFocus={() => {
            if (status !== "idle" && query.trim().length >= 2) setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              if (event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (open && results.length > 0) {
                chooseResult(results[activeIndex >= 0 ? activeIndex : 0]);
              }
              return;
            }
            if (event.key === "Escape") {
              setOpen(false);
              setActiveIndex(-1);
              return;
            }
            if (results.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => (current + 1) % results.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) =>
                current <= 0 ? results.length - 1 : current - 1,
              );
            }
          }}
          className="min-h-12 w-full rounded-lg border border-[var(--line)] bg-white py-3 pl-11 pr-12 font-semibold placeholder:text-[#8c9992]"
        />
        {query ? (
          <button
            type="button"
            onClick={clearSelection}
            className="absolute right-0.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-[#607168] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"
            aria-label="출발지 지우기"
          >
            <X size={17} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <p id="departure-search-help" className="mt-2 text-xs leading-5 text-[var(--muted)]">
        장소명과 주소를 모두 검색할 수 있어요. 결과를 선택하면 실제 좌표가 경로에 반영됩니다.
      </p>

      {open ? (
        <div
          id={listboxId}
          role={status === "ready" ? "listbox" : "status"}
          aria-label={status === "ready" ? "출발지 검색 결과" : undefined}
          aria-live={status === "ready" ? undefined : "polite"}
          className="planner-departure-results mt-3 overflow-hidden rounded-lg border border-[var(--line)] bg-white"
        >
          {status === "loading" ? (
            <p className="flex min-h-16 items-center gap-2 px-4 text-sm font-bold text-[var(--muted)]">
              <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />
              장소와 주소를 검색하고 있어요.
            </p>
          ) : null}
          {status === "empty" || status === "error" ? (
            <p className={`min-h-16 px-4 py-5 text-sm font-bold ${status === "error" ? "text-[#a44537]" : "text-[var(--muted)]"}`}>
              {message}
            </p>
          ) : null}
          {status === "ready"
            ? results.map((result, index) => {
                return (
                  <button
                    key={result.id}
                    id={`departure-option-${index}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === activeIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => chooseResult(result)}
                    className={`flex min-h-16 w-full items-start gap-3 border-b border-[var(--line)] px-4 py-3 text-left last:border-b-0 ${
                      index === activeIndex ? "bg-[var(--brand-soft)]" : "bg-white hover:bg-[#f6faf7]"
                    }`}
                  >
                    <MapPin className="mt-0.5 shrink-0 text-[var(--brand)]" size={18} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-sm font-extrabold">{result.label}</span>
                      <span className="mt-1 block text-xs text-[var(--muted)]">
                        {result.kind === "place" ? "장소" : "주소"} · {result.address}
                      </span>
                    </span>
                  </button>
                );
              })
            : null}
        </div>
      ) : null}

      {value ? (
        <div
          className="mt-3 flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--mint-500)] bg-[var(--brand-soft)] p-4"
          role="status"
        >
          <CheckCircle2 className="mt-0.5 shrink-0 text-[var(--brand)]" size={19} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-[var(--brand)]">선택한 출발지</p>
            <p className="mt-1 break-words text-sm font-extrabold">{value.label}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">경로 계산용 좌표 확인 완료</p>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="min-h-11 shrink-0 rounded-full px-3 text-xs font-extrabold text-[var(--brand)] hover:bg-white/70"
          >
            변경
          </button>
        </div>
      ) : null}
    </div>
  );
}
