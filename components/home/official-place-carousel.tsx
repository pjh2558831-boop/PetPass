"use client";

import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { PlaceCardMedia } from "@/components/places/place-card-media";
import { resolveHomepageCardImage } from "@/lib/homepage/homepage-card-image";
import type {
  HomepageLayerSnapshot,
  HomepagePlaceCard,
  HomepagePlaceLayer,
} from "@/types/homepage-places";
import type { HomepageFeaturedState } from "@/types/homepage";

type CarouselFilter = "all" | HomepagePlaceLayer;

const FILTERS: Array<{ id: CarouselFilter; label: string }> = [
  { id: "all", label: "전체" },
  { id: "official", label: "공식 장소" },
  { id: "kakao_candidate", label: "카카오 후보" },
  { id: "veterinary", label: "동물병원" },
  { id: "pet_shop", label: "펫샵" },
];

function visibleForFilter(place: HomepagePlaceCard, filter: CarouselFilter) {
  if (filter === "all") {
    return place.layer === "official" || place.layer === "kakao_candidate";
  }
  return place.layer === filter;
}

export function HomepagePlaceCarousel({
  places,
  layers,
  featuredState,
  staticMapEnabled,
  onOptionalLayerRequest,
}: {
  places: HomepagePlaceCard[];
  layers: Record<HomepagePlaceLayer, HomepageLayerSnapshot>;
  featuredState: HomepageFeaturedState;
  staticMapEnabled: boolean;
  onOptionalLayerRequest?: (layer: "veterinary" | "pet_shop") => void;
}) {
  const [activeFilter, setActiveFilter] = useState<CarouselFilter>("all");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());

  const visiblePlaces = useMemo(
    () => places.filter((place) => visibleForFilter(place, activeFilter)),
    [activeFilter, places],
  );

  const moveCarousel = (direction: -1 | 1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({
      left: direction * Math.max(260, scroller.clientWidth * 0.82),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  const handleCardKeyDown = (
    event: KeyboardEvent<HTMLElement>,
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
    const card = cardRefs.current.get(visiblePlaces[nextIndex].id);
    card?.focus();
    card?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "nearest",
      inline: "nearest",
    });
  };

  const activeLayer = activeFilter === "all" ? null : layers[activeFilter];
  const publicCatalogUnavailable =
    layers.kakao_candidate.state === "unavailable" ||
    layers.veterinary.state === "unavailable" ||
    layers.pet_shop.state === "unavailable";
  const officialStatus =
    featuredState === "partial"
      ? "일부 공식 장소의 동반 근거를 확인하지 못해 확인된 장소만 보여드려요."
      : featuredState === "unavailable"
        ? "공식 장소 목록은 확인했지만 동반 근거를 지금 확인할 수 없습니다."
        : null;

  if (places.length === 0) return null;

  return (
    <section className="homepage-places-section" aria-labelledby="homepage-places-title">
      <div className="homepage-section-heading">
        <div>
          <p className="homepage-kicker">장소 둘러보기</p>
          <h2 id="homepage-places-title">함께 살펴볼 장소</h2>
          <p>공식 동반 가능 장소와 확인이 필요한 카카오 후보를 구분해 보여드려요.</p>
        </div>
        <div className="homepage-heading-actions">
          <Link href="/results?tab=catalog" className="homepage-text-link">
            전체 보기
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
          <div className="homepage-carousel-buttons" role="group" aria-label="장소 카드 이동">
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

      <div className="homepage-filter-chips" role="group" aria-label="장소 출처 필터">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            aria-pressed={activeFilter === filter.id}
            onClick={() => {
              setActiveFilter(filter.id);
              if (filter.id === "veterinary" || filter.id === "pet_shop") {
                onOptionalLayerRequest?.(filter.id);
              }
            }}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {officialStatus && (activeFilter === "all" || activeFilter === "official") ? (
        <p className="homepage-inline-status" role="status">{officialStatus}</p>
      ) : null}
      {publicCatalogUnavailable && activeFilter === "all" ? (
        <p className="homepage-inline-status homepage-inline-status--warning" role="status">
          카카오 장소 데이터 준비 중 · 공식 장소는 계속 확인할 수 있어요.
        </p>
      ) : null}
      {activeLayer?.state === "unavailable" ? (
        <p className="homepage-inline-status homepage-inline-status--warning" role="status">
          카카오 장소 데이터 준비 중
        </p>
      ) : null}
      {activeLayer?.state === "deferred" ? (
        <p className="homepage-inline-status" role="status">
          카카오 장소 데이터를 불러오고 있어요.
        </p>
      ) : null}

      {visiblePlaces.length > 0 ? (
        <div
          ref={scrollerRef}
          className="homepage-place-scroller"
          role="region"
          aria-roledescription="캐러셀"
          aria-label="부산 장소 카드"
        >
          {visiblePlaces.map((place, index) => {
            const image = resolveHomepageCardImage(place, {
              regionId: "busan",
              staticMapEnabled,
            });
            const cardContent = (
              <>
                <PlaceCardMedia
                  image={image}
                  fallbackCategory={place.category}
                  className="homepage-place-image"
                  sizes="(max-width: 767px) 82vw, (max-width: 1023px) 31vw, 230px"
                />
                <div className="homepage-place-card-body">
                  <div className="homepage-card-meta">
                    <span>{place.categoryLabel}</span>
                    {place.isAllowed ? (
                      <span className="homepage-allowed-badge">
                        <ShieldCheck size={13} aria-hidden="true" />
                        동반 가능
                      </span>
                    ) : (
                      <span className={`homepage-source-badge homepage-source-badge--${place.layer}`}>
                        {place.statusLabel}
                      </span>
                    )}
                  </div>
                  <h3>{place.name}</h3>
                  <p className="homepage-place-region">
                    <MapPin size={13} aria-hidden="true" />
                    {place.district ?? place.address}
                  </p>
                  {place.phone ? (
                    <p className="homepage-place-phone">
                      <Phone size={12} aria-hidden="true" />
                      {place.phone}
                    </p>
                  ) : null}
                  <p className={`homepage-place-source homepage-place-source--${place.layer}`}>
                    {place.sourceLabel}
                  </p>
                  {place.warning && place.layer !== "kakao_candidate" ? (
                    <p className="homepage-place-warning">{place.warning}</p>
                  ) : null}
                </div>
              </>
            );

            return (
              <article key={place.id} className={`homepage-place-card homepage-place-card--${place.layer}`}>
                {place.href ? (
                  place.external ? (
                    <a
                      ref={(node) => {
                        if (node) cardRefs.current.set(place.id, node);
                        else cardRefs.current.delete(place.id);
                      }}
                      href={place.href}
                      target="_blank"
                      rel="noreferrer"
                      onKeyDown={(event) => handleCardKeyDown(event, index)}
                      aria-label={`${place.name} 카카오 장소 정보 새 창에서 보기`}
                    >
                      {cardContent}
                    </a>
                  ) : (
                    <Link
                      ref={(node) => {
                        if (node) cardRefs.current.set(place.id, node);
                        else cardRefs.current.delete(place.id);
                      }}
                      href={place.href}
                      onKeyDown={(event) => handleCardKeyDown(event, index)}
                      aria-label={`${place.name} 상세 보기`}
                    >
                      {cardContent}
                    </Link>
                  )
                ) : (
                  <div
                    ref={(node) => {
                      if (node) cardRefs.current.set(place.id, node);
                      else cardRefs.current.delete(place.id);
                    }}
                    tabIndex={0}
                    onKeyDown={(event) => handleCardKeyDown(event, index)}
                  >
                    {cardContent}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="homepage-empty-card" role="status">
          <ShieldCheck size={24} aria-hidden="true" />
          <strong>
            {activeLayer?.state === "unavailable"
              ? "카카오 장소 데이터 준비 중"
              : activeLayer?.state === "deferred"
                ? "카카오 장소 데이터를 불러오고 있어요"
              : "현재 이 분류에서 보여드릴 장소가 없어요"}
          </strong>
          <p>
            확인되지 않은 장소나 수치를 임의로 추가하지 않습니다.
          </p>
        </div>
      )}
    </section>
  );
}

export const OfficialPlaceCarousel = HomepagePlaceCarousel;
