"use client";

import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { PlaceImage } from "@/components/places/place-image";
import { deriveRegionLabel } from "@/lib/regions/label";
import { TOUR_CATEGORY_LABELS } from "@/lib/shared/format";
import type {
  HomepageFeaturedPlace,
  HomepageFeaturedState,
} from "@/types/homepage";
import type { TourPlaceCategory } from "@/types/place";

const CATEGORY_ORDER: readonly TourPlaceCategory[] = [
  "attraction",
  "culture",
  "festival",
  "leisure",
  "accommodation",
  "food",
  "shopping",
  "transportation",
  "unknown",
];

function placeDetailHref(place: HomepageFeaturedPlace): string {
  const contentTypeQuery = place.summary.contentTypeId
    ? `?contentTypeId=${encodeURIComponent(place.summary.contentTypeId)}`
    : "";
  return `/places/${encodeURIComponent(place.summary.contentId)}${contentTypeQuery}`;
}

export function OfficialPlaceCarousel({
  places,
  state,
}: {
  places: HomepageFeaturedPlace[];
  state: HomepageFeaturedState;
}) {
  const [requestedCategory, setRequestedCategory] =
    useState<TourPlaceCategory | "all">("all");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLAnchorElement>());

  const eligiblePlaces = useMemo(
    () =>
      places.filter(
        ({ assessment }) =>
          assessment.verdict === "allowed" &&
          assessment.evaluationState === "complete",
      ),
    [places],
  );

  const availableCategories = useMemo(() => {
    const available = new Set(
      eligiblePlaces.map(({ summary }) => summary.category),
    );
    return CATEGORY_ORDER.filter((category) => available.has(category));
  }, [eligiblePlaces]);
  const activeCategory =
    requestedCategory === "all" || availableCategories.includes(requestedCategory)
      ? requestedCategory
      : "all";

  const visiblePlaces = useMemo(
    () =>
      activeCategory === "all"
        ? eligiblePlaces
        : eligiblePlaces.filter(
            ({ summary }) => summary.category === activeCategory,
          ),
    [activeCategory, eligiblePlaces],
  );

  const moveCarousel = (direction: -1 | 1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    scroller.scrollBy({
      left: direction * Math.max(260, scroller.clientWidth * 0.82),
      behavior: reducedMotion ? "auto" : "smooth",
    });
  };

  const handleCardKeyDown = (
    event: KeyboardEvent<HTMLAnchorElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = Math.min(index + 1, visiblePlaces.length - 1);
    } else if (event.key === "ArrowLeft") {
      nextIndex = Math.max(index - 1, 0);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = visiblePlaces.length - 1;
    }
    if (nextIndex === null || nextIndex === index) return;
    event.preventDefault();
    const nextPlace = visiblePlaces[nextIndex];
    const nextCard = cardRefs.current.get(nextPlace.summary.contentId);
    nextCard?.focus();
    nextCard?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "nearest",
      inline: "nearest",
    });
  };

  const statusMessage =
    state === "partial"
      ? "일부 장소의 동반 근거를 현재 확인하지 못했습니다. 확인된 장소만 보여드려요."
      : state === "unavailable"
        ? "공식 장소 목록은 확인했지만 동반 근거를 지금 확인할 수 없습니다."
        : null;

  return (
    <section className="homepage-places-section" aria-labelledby="homepage-places-title">
      <div className="homepage-section-heading">
        <div>
          <p className="homepage-kicker">OFFICIAL PLACES</p>
          <h2 id="homepage-places-title">함께 갈 수 있는 장소</h2>
          <p>현재 공식 근거에서 동반 가능이 확인된 장소만 소개합니다.</p>
        </div>
        <div className="homepage-heading-actions">
          <Link href="/results?tab=catalog" className="homepage-text-link">
            전체 보기
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
          <div
            className="homepage-carousel-buttons"
            role="group"
            aria-label="장소 카드 이동"
          >
            <button
              type="button"
              onClick={() => moveCarousel(-1)}
              disabled={visiblePlaces.length <= 1}
              aria-label="이전 장소 보기"
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => moveCarousel(1)}
              disabled={visiblePlaces.length <= 1}
              aria-label="다음 장소 보기"
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {availableCategories.length > 0 ? (
        <div
          className="homepage-filter-chips"
          role="group"
          aria-label="장소 카테고리 필터"
        >
          <button
            type="button"
            aria-pressed={activeCategory === "all"}
            onClick={() => setRequestedCategory("all")}
          >
            전체
          </button>
          {availableCategories.map((category) => (
            <button
              key={category}
              type="button"
              aria-pressed={activeCategory === category}
              onClick={() => setRequestedCategory(category)}
            >
              {TOUR_CATEGORY_LABELS[category]}
            </button>
          ))}
        </div>
      ) : null}

      {statusMessage ? (
        <p className="homepage-inline-status" role="status">
          {statusMessage}
        </p>
      ) : null}

      {visiblePlaces.length > 0 ? (
        <div
          ref={scrollerRef}
          className="homepage-place-scroller"
          role="region"
          aria-roledescription="carousel"
          aria-label="동반 가능한 공식 장소"
        >
          {visiblePlaces.map((place, index) => {
            const { summary } = place;
            const title = summary.title ?? "이름 미확인";
            const district = deriveRegionLabel({
              regionCode: summary.legalRegionCode,
              districtCode: summary.legalDistrictCode,
              roadAddress: summary.address,
            });
            return (
              <article key={summary.contentId} className="homepage-place-card">
                <Link
                  ref={(node) => {
                    if (node) cardRefs.current.set(summary.contentId, node);
                    else cardRefs.current.delete(summary.contentId);
                  }}
                  href={placeDetailHref(place)}
                  onKeyDown={(event) => handleCardKeyDown(event, index)}
                  aria-label={`${title} 상세 보기`}
                >
                  <PlaceImage
                    imageUrl={summary.thumbnailUrl ?? summary.imageUrl}
                    title={title}
                    className="homepage-place-image"
                    sizes="(max-width: 767px) 78vw, (max-width: 1023px) 38vw, 230px"
                  />
                  <div className="homepage-place-card-body">
                    <div className="homepage-card-meta">
                      <span>{TOUR_CATEGORY_LABELS[summary.category]}</span>
                      <span className="homepage-allowed-badge">
                        <ShieldCheck size={13} aria-hidden="true" />
                        동반 가능
                      </span>
                    </div>
                    <h3>{title}</h3>
                    <p className="homepage-place-region">
                      <MapPin size={13} aria-hidden="true" />
                      {district}
                    </p>
                    <p className="homepage-place-source">한국관광공사</p>
                  </div>
                </Link>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="homepage-empty-card" role="status">
          <ShieldCheck size={24} aria-hidden="true" />
          <strong>
            {state === "unavailable"
              ? "동반 근거를 지금 확인할 수 없어요"
              : "현재 확인된 동반 가능 장소가 없어요"}
          </strong>
          <p>
            {state === "unavailable"
              ? "공식 제공처가 정상화되면 다시 확인해 주세요."
              : "조건을 임의로 완화하지 않고, 확인된 장소가 생기면 보여드릴게요."}
          </p>
        </div>
      )}
    </section>
  );
}
