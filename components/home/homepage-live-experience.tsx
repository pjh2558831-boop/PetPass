"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Map as MapIcon,
  MapPin,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapPanel } from "@/components/map/map-panel";
import { PlaceImage } from "@/components/places/place-image";
import { OfficialPlaceCarousel } from "@/components/home/official-place-carousel";
import { createOfficialTourMapLocations } from "@/lib/places/tour-map-locations";
import { deriveRegionLabel } from "@/lib/regions/label";
import { TOUR_CATEGORY_LABELS } from "@/lib/shared/format";
import type { ApiError, ApiResult } from "@/types/api";
import type {
  HomepageFeaturedPlace,
  TourHomepageSnapshot,
} from "@/types/homepage";
import type { TourPlaceCategory, TourPlaceSummary } from "@/types/place";

const CATEGORY_ORDER: readonly TourPlaceCategory[] = [
  "attraction",
  "culture",
  "festival",
  "leisure",
  "accommodation",
  "food",
];

const EMPTY_ROUTE_COORDINATES: [] = [];

const API_ERROR_CODES = new Set<ApiError["code"]>([
  "CONFIGURATION_REQUIRED",
  "UPSTREAM_ERROR",
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_AUTHENTICATION",
  "UPSTREAM_FORBIDDEN",
  "UPSTREAM_QUOTA",
  "INVALID_RESPONSE",
  "INVALID_REQUEST",
  "RATE_LIMITED",
  "NOT_FOUND",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isApiError(value: unknown): value is ApiError {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    API_ERROR_CODES.has(value.code as ApiError["code"]) &&
    typeof value.message === "string" &&
    typeof value.retryable === "boolean"
  );
}

function isHomepageSnapshot(value: unknown): value is TourHomepageSnapshot {
  if (!isRecord(value)) return false;
  const catalog = value.catalog;
  const featured = value.featured;
  if (!isRecord(catalog) || !isRecord(featured)) return false;

  const catalogPlaces = catalog.places;
  const featuredPlaces = featured.places;
  if (!Array.isArray(catalogPlaces) || !Array.isArray(featuredPlaces)) return false;
  if (
    typeof catalog.totalCount !== "number" ||
    typeof catalog.page !== "number" ||
    typeof catalog.pageSize !== "number" ||
    !isRecord(catalog.source) ||
    !["ready", "partial", "empty", "unavailable"].includes(
      String(featured.state),
    ) ||
    typeof featured.assessedCount !== "number" ||
    typeof featured.failedCount !== "number"
  ) {
    return false;
  }

  const isSummary = (summary: unknown) =>
    isRecord(summary) &&
    typeof summary.contentId === "string" &&
    (typeof summary.title === "string" || summary.title === null) &&
    typeof summary.category === "string" &&
    isRecord(summary.source);

  if (!catalogPlaces.every(isSummary)) return false;
  return featuredPlaces.every(
    (place) =>
      isRecord(place) &&
      isSummary(place.summary) &&
      isRecord(place.assessment) &&
      ["allowed", "conditional", "not_allowed", "unknown"].includes(
        String(place.assessment.verdict),
      ) &&
      [
        "complete",
        "partial",
        "insufficient_evidence",
        "unavailable",
        "not_applicable",
      ].includes(String(place.assessment.evaluationState)) &&
      isRecord(place.source),
  );
}

function parseHomepageResult(
  value: unknown,
): ApiResult<TourHomepageSnapshot> | null {
  if (!isRecord(value) || typeof value.ok !== "boolean") return null;
  const requestId =
    typeof value.requestId === "string" ? value.requestId : "homepage";
  if (value.ok) {
    return isHomepageSnapshot(value.data)
      ? { ok: true, data: value.data, requestId }
      : null;
  }
  return isApiError(value.error)
    ? { ok: false, error: value.error, requestId }
    : null;
}

const GENERIC_ERROR: ApiError = {
  code: "UPSTREAM_ERROR",
  message: "공식 관광 정보를 불러오지 못했습니다.",
  retryable: true,
};

async function requestHomepageSnapshot(): Promise<
  ApiResult<TourHomepageSnapshot>
> {
  const response = await fetch("/api/tour/homepage", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return { ok: false, error: GENERIC_ERROR, requestId: "homepage" };
  }
  const body = parseHomepageResult(value);
  if (!body) {
    return { ok: false, error: GENERIC_ERROR, requestId: "homepage" };
  }
  if (!response.ok && body.ok) {
    return {
      ok: false,
      error: GENERIC_ERROR,
      requestId: body.requestId,
    };
  }
  return body;
}

function detailHref(summary: TourPlaceSummary): string {
  const contentTypeQuery = summary.contentTypeId
    ? `?contentTypeId=${encodeURIComponent(summary.contentTypeId)}`
    : "";
  return `/places/${encodeURIComponent(summary.contentId)}${contentTypeQuery}`;
}

function HomepageLiveSkeleton() {
  return (
    <div className="homepage-live-loading" aria-live="polite" aria-busy="true">
      <section className="homepage-map-loading" aria-label="공식 관광 지도 불러오는 중">
        <div className="homepage-loading-copy">
          <span />
          <span />
          <span />
        </div>
        <p>한국관광공사 장소 정보를 불러오고 있어요.</p>
      </section>
      <section className="homepage-carousel-loading" aria-label="동반 가능 장소 불러오는 중">
        <div className="homepage-loading-heading" />
        <div className="homepage-loading-cards" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      </section>
    </div>
  );
}

function HomepageLiveError({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry: () => void;
}) {
  return (
    <section className="homepage-live-error" role="alert">
      <span className="homepage-error-icon">
        <MapIcon size={24} aria-hidden="true" />
      </span>
      <div>
        <p className="homepage-kicker">OFFICIAL DATA UNAVAILABLE</p>
        <h2>공식 관광 정보를 지금 불러올 수 없어요</h2>
        <p>{error.message}</p>
        <p className="homepage-error-truth">
          확인되지 않은 수치나 데모 장소로 대신 보여드리지 않습니다.
        </p>
      </div>
      {error.retryable ? (
        <button type="button" onClick={onRetry} className="homepage-retry-button">
          <RefreshCw size={16} aria-hidden="true" />
          다시 시도
        </button>
      ) : null}
    </section>
  );
}

export function HomepageLiveExperience() {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [snapshot, setSnapshot] = useState<TourHomepageSnapshot | null>(null);
  const [error, setError] = useState<ApiError>(GENERIC_ERROR);
  const [retryToken, setRetryToken] = useState(0);
  const [requestedSelectionId, setRequestedSelectionId] = useState<string | null>(
    null,
  );
  const requestRef = useRef<Promise<ApiResult<TourHomepageSnapshot>> | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    const request = requestRef.current ?? requestHomepageSnapshot();
    requestRef.current = request;
    void request
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setSnapshot(null);
          setError(result.error);
          setLoadState("error");
          return;
        }
        setSnapshot(result.data);
        setLoadState("ready");
      })
      .catch(() => {
        if (!active) return;
        setSnapshot(null);
        setError(GENERIC_ERROR);
        setLoadState("error");
      });
    return () => {
      active = false;
    };
  }, [retryToken]);

  const retry = () => {
    requestRef.current = null;
    setSnapshot(null);
    setRequestedSelectionId(null);
    setLoadState("loading");
    setRetryToken((current) => current + 1);
  };

  const locations = useMemo(
    () =>
      snapshot
        ? createOfficialTourMapLocations(snapshot.catalog.places)
        : [],
    [snapshot],
  );
  const locationIds = useMemo(
    () => new Set(locations.map(({ id }) => id)),
    [locations],
  );
  const featuredById = useMemo(
    () =>
      new Map(
        (snapshot?.featured.places ?? []).map(
          (place) => [place.summary.contentId, place] as const,
        ),
      ),
    [snapshot],
  );
  const catalogById = useMemo(
    () =>
      new Map(
        (snapshot?.catalog.places ?? []).map(
          (place) => [place.contentId, place] as const,
        ),
      ),
    [snapshot],
  );
  const defaultSelectionId =
    snapshot?.featured.places.find(({ summary }) =>
      locationIds.has(summary.contentId),
    )?.summary.contentId ?? locations[0]?.id ?? null;
  const selectedLocationId =
    requestedSelectionId && locationIds.has(requestedSelectionId)
      ? requestedSelectionId
      : defaultSelectionId;
  const selectedFeatured: HomepageFeaturedPlace | null = selectedLocationId
    ? featuredById.get(selectedLocationId) ?? null
    : null;
  const selectedIsAllowed = Boolean(
    selectedFeatured?.assessment.verdict === "allowed" &&
      selectedFeatured.assessment.evaluationState === "complete",
  );
  const selectedSummary = selectedLocationId
    ? selectedFeatured?.summary ?? catalogById.get(selectedLocationId) ?? null
    : null;

  const categoryCounts = useMemo(() => {
    const counts = new Map<TourPlaceCategory, number>();
    for (const place of snapshot?.catalog.places ?? []) {
      counts.set(place.category, (counts.get(place.category) ?? 0) + 1);
    }
    return CATEGORY_ORDER.flatMap((category) => {
      const count = counts.get(category) ?? 0;
      return count > 0 ? [{ category, count }] : [];
    });
  }, [snapshot]);

  if (loadState === "loading") return <HomepageLiveSkeleton />;
  if (loadState === "error" || !snapshot) {
    return <HomepageLiveError error={error} onRetry={retry} />;
  }

  const omittedCoordinateCount = Math.max(
    0,
    snapshot.catalog.places.length - locations.length,
  );
  const selectedTitle = selectedSummary?.title ?? "이름 미확인";
  const selectedDistrict = selectedSummary
    ? deriveRegionLabel({
        regionCode: selectedSummary.legalRegionCode,
        districtCode: selectedSummary.legalDistrictCode,
        roadAddress: selectedSummary.address,
      })
    : null;

  return (
    <div className="homepage-live-ready">
      <section className="homepage-map-section" aria-labelledby="homepage-map-title">
        <div className="homepage-map-shell">
          <div className="homepage-area-summary">
            <p className="homepage-kicker">BUSAN OFFICIAL MAP</p>
            <h2 id="homepage-map-title">
              부산 공식 관광 장소
              <strong>{snapshot.catalog.totalCount}곳</strong>
            </h2>
            <p>
              한국관광공사가 현재 공개한 기본 카탈로그 기준이며, 동반 가능
              장소 수를 뜻하지 않습니다.
            </p>
            {categoryCounts.length > 0 ? (
              <dl>
                {categoryCounts.map(({ category, count }) => (
                  <div key={category}>
                    <dt>{TOUR_CATEGORY_LABELS[category]}</dt>
                    <dd>{count}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <p className="homepage-map-count-note">
              지도 표시 {locations.length}곳
              {omittedCoordinateCount > 0
                ? ` · 좌표 미확인 ${omittedCoordinateCount}곳 제외`
                : ""}
            </p>
          </div>

          <Link href="/results?tab=catalog" className="homepage-map-open-link">
            지도 크게 보기
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>

          <div className="homepage-map-canvas-wrap">
            <MapPanel
              title="부산 공식 관광 장소 지도"
              locationLabel="부산 전체"
              locations={locations}
              routeCoordinates={EMPTY_ROUTE_COORDINATES}
              selectedLocationId={selectedLocationId}
              onLocationSelect={(id) => {
                setRequestedSelectionId(id ?? defaultSelectionId);
              }}
              viewportKey="homepage:busan:official"
              showLocationLabel={false}
              showSelectionInfo={false}
              emptyMessage="현재 지도에 표시할 공식 장소 좌표가 없습니다."
            />
          </div>

          {selectedSummary ? (
            <article
              className="homepage-selected-place"
              aria-live="polite"
              aria-atomic="true"
            >
              <PlaceImage
                imageUrl={
                  selectedSummary.thumbnailUrl ?? selectedSummary.imageUrl
                }
                title={selectedTitle}
                className="homepage-selected-image"
                sizes="92px"
              />
              <div className="homepage-selected-body">
                <div className="homepage-selected-meta">
                  <span>{TOUR_CATEGORY_LABELS[selectedSummary.category]}</span>
                  {selectedIsAllowed ? (
                    <span className="homepage-allowed-badge">
                      <ShieldCheck size={12} aria-hidden="true" />
                      동반 가능
                    </span>
                  ) : (
                    <span className="homepage-confirm-badge">조건 확인 필요</span>
                  )}
                </div>
                <h3>{selectedTitle}</h3>
                <p>
                  <MapPin size={12} aria-hidden="true" />
                  {selectedDistrict}
                </p>
                <span className="homepage-selected-source">한국관광공사</span>
              </div>
              <Link
                href={detailHref(selectedSummary)}
                className="homepage-selected-link"
                aria-label={`${selectedTitle} 상세 보기`}
              >
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </article>
          ) : null}
        </div>
      </section>

      <OfficialPlaceCarousel
        key={`${snapshot.catalog.source.retrievedAt}:${snapshot.featured.assessedCount}:${snapshot.featured.places
          .map(({ summary }) => summary.contentId)
          .join(",")}`}
        places={snapshot.featured.places}
        state={snapshot.featured.state}
      />
    </div>
  );
}
