"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, MapPin, Search, X } from "lucide-react";
import type { KakaoGeocodeResult } from "@/types/kakao";
import type { ResolvedDeparture } from "@/types/pet";

type SearchStatus = "idle" | "loading" | "ready" | "empty" | "error";

function parseGeocodeResults(value: unknown): KakaoGeocodeResult[] | null {
  if (!Array.isArray(value)) return null;
  const results: KakaoGeocodeResult[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Record<string, unknown>;
    const coordinates = candidate.coordinates as Record<string, unknown> | undefined;
    const latitude = coordinates?.latitude;
    const longitude = coordinates?.longitude;
    if (
      typeof candidate.address !== "string" ||
      typeof candidate.addressType !== "string" ||
      (candidate.roadAddress !== undefined && typeof candidate.roadAddress !== "string") ||
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
      address: candidate.address,
      addressType: candidate.addressType,
      roadAddress: candidate.roadAddress as string | undefined,
      coordinates: { latitude, longitude },
    });
  }
  return results;
}

function selectedDeparture(result: KakaoGeocodeResult): ResolvedDeparture {
  return {
    label: result.roadAddress?.trim() || result.address.trim(),
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
  const [results, setResults] = useState<KakaoGeocodeResult[]>([]);
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
        const params = new URLSearchParams({ address: trimmedQuery, size: "5" });
        const response = await fetch(`/api/kakao/local/geocode?${params}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as unknown;
        if (controller.signal.aborted || requestSequence !== requestSequenceRef.current) {
          return;
        }
        if (!body || typeof body !== "object") {
          throw new Error("주소 검색 응답 형식을 확인할 수 없습니다.");
        }
        const apiResult = body as Record<string, unknown>;
        if (!response.ok || apiResult.ok !== true) {
          const error = apiResult.error as Record<string, unknown> | undefined;
          throw new Error(
            typeof error?.message === "string"
              ? error.message
              : "주소를 검색하지 못했습니다.",
          );
        }
        const parsedResults = parseGeocodeResults(apiResult.data);
        if (!parsedResults) {
          throw new Error("주소 검색 응답 형식을 확인할 수 없습니다.");
        }
        setResults(parsedResults);
        setStatus(parsedResults.length > 0 ? "ready" : "empty");
        setMessage(
          parsedResults.length > 0
            ? `${parsedResults.length}개의 주소를 찾았습니다.`
            : "일치하는 주소가 없습니다. 도로명이나 지번을 더 정확히 입력해 주세요.",
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
            : "주소를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.",
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

  const chooseResult = (result: KakaoGeocodeResult) => {
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
        출발지 주소
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
          placeholder="도로명 또는 지번 주소를 검색하세요"
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
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              chooseResult(results[activeIndex >= 0 ? activeIndex : 0]);
            }
          }}
          className="min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-white py-3 pl-11 pr-12 font-semibold shadow-sm placeholder:text-[#8c9992]"
        />
        {query ? (
          <button
            type="button"
            onClick={clearSelection}
            className="absolute right-0.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-[#607168] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"
            aria-label="출발지 지우기"
          >
            <X size={17} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <p id="departure-search-help" className="mt-2 text-xs leading-5 text-[var(--muted)]">
        검색 결과를 선택해야 실제 좌표가 경로의 첫 이동 구간에 반영됩니다.
      </p>

      {open ? (
        <div
          id={listboxId}
          role={status === "ready" ? "listbox" : "status"}
          aria-label={status === "ready" ? "출발지 주소 검색 결과" : undefined}
          aria-live={status === "ready" ? undefined : "polite"}
          className="mt-3 overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-white shadow-[var(--shadow-card)]"
        >
          {status === "loading" ? (
            <p className="flex min-h-16 items-center gap-2 px-4 text-sm font-bold text-[var(--muted)]">
              <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />
              주소를 검색하고 있어요.
            </p>
          ) : null}
          {status === "empty" || status === "error" ? (
            <p className={`min-h-16 px-4 py-5 text-sm font-bold ${status === "error" ? "text-[#a44537]" : "text-[var(--muted)]"}`}>
              {message}
            </p>
          ) : null}
          {status === "ready"
            ? results.map((result, index) => {
                const label = result.roadAddress?.trim() || result.address;
                return (
                  <button
                    key={`${result.address}-${result.coordinates.latitude}-${result.coordinates.longitude}`}
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
                      <span className="block text-sm font-extrabold">{label}</span>
                      {label !== result.address ? (
                        <span className="mt-1 block text-xs text-[var(--muted)]">
                          지번 {result.address}
                        </span>
                      ) : null}
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
