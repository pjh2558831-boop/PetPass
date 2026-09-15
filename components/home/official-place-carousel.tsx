"use client";
import { requestMapPlaceCardDetails } from "@/lib/map-places/card-details-client";
import { MAP_PLACE_CARD_PAGE_SIZE } from "@/types/map-place-card-details";

import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { PlaceCardMedia } from "@/components/places/place-card-media";
import { resolveHomepageCardImage } from "@/lib/homepage/homepage-card-image";
import type {
  HomepageLayerSnapshot,
  HomepagePlaceCard,
  HomepagePlaceLayer,
} from "@/types/homepage-places";
import type { RegionId } from "@/types/region";
import { getRegionConfig } from "@/lib/regions/config";
import type { HomepageFeaturedState } from "@/types/homepage";

export function HomepagePlaceCarousel({
  places,
  layers,
  featuredState,
  staticMapEnabled,
  regionId = "busan",
}: {
  places: HomepagePlaceCard[];
  layers: Record<HomepagePlaceLayer, HomepageLayerSnapshot>;
  featuredState: HomepageFeaturedState;
  staticMapEnabled: boolean;
  regionId?: RegionId;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const [photos, setPhotos] = useState<{ region: RegionId; images: Map<string, string>; failed: boolean } | null>(null);
  const photoRequestKey = places.filter(place => !place.imageUrl && (place.layer === "official" || place.layer === "kakao_candidate"))
    .map(place => place.id).sort().join(",");
  useEffect(() => {
    if (!photoRequestKey) return;
    const controller = new AbortController();
    const ids = photoRequestKey.split(",");
    const requests = [];
    for (let offset = 0; offset < ids.length; offset += MAP_PLACE_CARD_PAGE_SIZE) {
      requests.push(requestMapPlaceCardDetails(regionId, "core", ids.slice(offset, offset + MAP_PLACE_CARD_PAGE_SIZE), controller.signal));
    }
    void Promise.allSettled(requests).then(results => {
      if (controller.signal.aborted) return;
      const images = new Map<string, string>();
      for (const result of results) {
        if (result.status === "fulfilled") for (const item of result.value.items) {
          if (item.imageUrl) images.set(item.id, item.imageUrl);
        }
      }
      setPhotos({ region: regionId, images, failed: results.some(result => result.status === "rejected") });
    });
    return () => controller.abort();
  }, [photoRequestKey, regionId]);
  const visiblePlaces = places.map(place => ({ ...place,
    imageUrl: place.imageUrl ?? (photos?.region === regionId ? photos.images.get(place.id) : null) ?? null,
  })).filter(place => Boolean(place.imageUrl))
    .sort((left, right) => Number(right.layer === "official") - Number(left.layer === "official"));

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

  const publicCatalogUnavailable =
    layers.kakao_candidate.state === "unavailable" ||
    layers.veterinary.state === "unavailable" ||
    layers.pet_shop.state === "unavailable";
  const officialStatus =
    featuredState === "partial"
      ? "일부 장소 정보를 불러오지 못해 현재 제공 가능한 장소만 보여드려요."
      : featuredState === "unavailable"
        ? "공식 장소 정보를 지금 불러올 수 없습니다."
        : null;

  if (places.length === 0) return <p className="homepage-inline-status" role="status">현재 이 지역에서 추천할 장소가 없습니다. 다른 지역을 선택해 보세요.</p>;

  return (
    <section className="homepage-places-section" aria-labelledby="homepage-places-title">
      <div className="homepage-section-heading">
        <div>
          <p className="homepage-kicker">장소 둘러보기</p>
          <h2 id="homepage-places-title">함께 살펴볼 장소</h2>
          <p>한국관광공사 제공 장소를 먼저, 이미지가 확인된 장소만 보여드려요.</p>
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

      {photos?.region === regionId && photos.failed ? <p className="homepage-inline-status" role="status">일부 장소 사진을 불러오지 못해 이미지가 확인된 장소만 보여드려요.</p> : null}
      {officialStatus ? (
        <p className="homepage-inline-status" role="status">{officialStatus}</p>
      ) : null}
      {publicCatalogUnavailable ? (
        <p className="homepage-inline-status homepage-inline-status--warning" role="status">
          일부 지역 장소 후보를 지금 불러올 수 없어요. 공식 장소는 계속 확인할 수 있습니다.
        </p>
      ) : null}

      {visiblePlaces.length > 0 ? (
        <div
          ref={scrollerRef}
          className="homepage-place-scroller"
          role="region"
          aria-roledescription="캐러셀"
          aria-label={`${getRegionConfig(regionId).displayName} 장소 카드`}
        >
          {visiblePlaces.map((place, index) => {
            const image = resolveHomepageCardImage(place, {
              regionId,
              staticMapEnabled,
            });
            const hasImage = image.kind === "provider_photo" || image.kind === "approved_upload";
            const cardContent = (
              <>
                <PlaceCardMedia
                    image={image}
                    fallbackCategory={place.category}
                    className="homepage-place-image"
                    sizes="(max-width: 600px) 240px, 260px"
                />
                <div className="homepage-place-card-body">
                  <div className="homepage-card-meta">
                    <span>{place.categoryLabel}</span>
                  </div>
                  <div className="homepage-place-card__labels">
                    {place.isAllowed ? (
                      <span className="homepage-place-card__label homepage-allowed-badge">
                        <ShieldCheck size={13} aria-hidden="true" />
                        동반 가능
                      </span>
                    ) : (
                      <span className={`homepage-place-card__label homepage-source-badge homepage-source-badge--${place.layer}`}>
                        {place.statusLabel}
                      </span>
                    )}
                    <span className={`homepage-place-card__label homepage-place-source homepage-place-source--${place.layer}`}>
                      {place.sourceLabel}
                    </span>
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
                  {place.warning && place.layer !== "kakao_candidate" ? (
                    <p className="homepage-place-warning">{place.warning}</p>
                  ) : null}
                </div>
              </>
            );

            return (
              <article key={place.id} className={`homepage-place-card homepage-place-card--${place.layer} ${hasImage ? "homepage-place-card--with-image" : "homepage-place-card--text-only"}`}>
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
        <p className="homepage-inline-status" role="status">현재 이 지역에서 이미지가 확인된 추천 장소가 없습니다. 다른 지역을 선택해 보세요.</p>
      )}
    </section>
  );
}

export const OfficialPlaceCarousel = HomepagePlaceCarousel;
