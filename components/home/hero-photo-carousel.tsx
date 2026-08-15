"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import {
  HERO_AUTOPLAY_INTERVAL_MS,
  HERO_CROSSFADE_DURATION_MS,
  HERO_PHOTOS,
} from "@/lib/homepage/hero-photo-manifest";

type HeroPhotoStyle = CSSProperties & {
  "--hero-position-desktop": string;
  "--hero-position-mobile": string;
};

function wrapIndex(index: number): number {
  return (index + HERO_PHOTOS.length) % HERO_PHOTOS.length;
}

export function HeroPhotoCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [outgoingIndex, setOutgoingIndex] = useState<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const update = () => setPageHidden(document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(
    () => () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    },
    [],
  );

  const goTo = useCallback(
    (nextIndex: number) => {
      const normalized = wrapIndex(nextIndex);
      if (normalized === activeIndex) return;
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      if (reducedMotion) {
        setOutgoingIndex(null);
      } else {
        setOutgoingIndex(activeIndex);
        transitionTimerRef.current = setTimeout(() => {
          setOutgoingIndex(null);
          transitionTimerRef.current = null;
        }, HERO_CROSSFADE_DURATION_MS);
      }
      setActiveIndex(normalized);
    },
    [activeIndex, reducedMotion],
  );

  useEffect(() => {
    if (hovered || focusWithin || pageHidden || reducedMotion) return;
    const timer = window.setTimeout(
      () => goTo(activeIndex + 1),
      HERO_AUTOPLAY_INTERVAL_MS,
    );
    return () => window.clearTimeout(timer);
  }, [activeIndex, focusWithin, goTo, hovered, pageHidden, reducedMotion]);

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
      setFocusWithin(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") goTo(activeIndex - 1);
    else if (event.key === "ArrowRight") goTo(activeIndex + 1);
    else if (event.key === "Home") goTo(0);
    else if (event.key === "End") goTo(HERO_PHOTOS.length - 1);
    else return;
    event.preventDefault();
  };

  const renderPhoto = (photoIndex: number, outgoing: boolean) => {
    const photo = HERO_PHOTOS[photoIndex];
    const style: HeroPhotoStyle = {
      "--hero-position-desktop": photo.objectPositionDesktop,
      "--hero-position-mobile": photo.objectPositionMobile,
    };
    return (
      <div
        key={`${photo.src}:${outgoing ? "outgoing" : "active"}`}
        className={`weekendoog-hero-slide ${outgoing ? "is-outgoing" : "is-active"}`}
        role={outgoing ? undefined : "group"}
        aria-roledescription={outgoing ? undefined : "슬라이드"}
        aria-label={outgoing ? undefined : `${photoIndex + 1} / ${HERO_PHOTOS.length}`}
        aria-hidden={outgoing ? "true" : undefined}
      >
        <Image
          src={photo.src}
          alt={outgoing ? "" : photo.alt}
          fill
          loading={photoIndex === 0 ? "eager" : "lazy"}
          fetchPriority={photoIndex === 0 ? "high" : "auto"}
          sizes="(max-width: 767px) calc(100vw - 24px), (max-width: 1023px) calc(100vw - 32px), min(56vw, 716px)"
          className="weekendoog-hero-photo object-cover"
          style={style}
        />
      </div>
    );
  };

  return (
    <div
      ref={rootRef}
      className="weekendoog-hero-carousel"
      role="region"
      aria-roledescription="캐러셀"
      aria-label="부산 반려견 여행 사진"
      tabIndex={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <div className="weekendoog-hero-frames">
        {outgoingIndex !== null ? renderPhoto(outgoingIndex, true) : null}
        {renderPhoto(activeIndex, false)}
        <div className="weekendoog-hero-photo-gradient" aria-hidden="true" />
      </div>

      <div className="weekendoog-hero-carousel-controls">
        <button
          type="button"
          onClick={() => goTo(activeIndex - 1)}
          aria-label="이전 여행 사진"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <div className="weekendoog-hero-dots" role="group" aria-label="여행 사진 선택">
          {HERO_PHOTOS.map((photo, index) => (
            <button
              key={photo.src}
              type="button"
              className={index === activeIndex ? "is-active" : undefined}
              onClick={() => goTo(index)}
              aria-label={`${index + 1}번 여행 사진 보기`}
              aria-current={index === activeIndex ? "true" : undefined}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => goTo(activeIndex + 1)}
          aria-label="다음 여행 사진"
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      <span className="weekendoog-hero-slide-status" aria-hidden="true">
        {String(activeIndex + 1).padStart(2, "0")} / {HERO_PHOTOS.length}
      </span>
    </div>
  );
}
