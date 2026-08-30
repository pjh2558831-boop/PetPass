import Image from "next/image";
import { type CSSProperties } from "react";
import { HERO_FEATURED_PHOTO } from "@/lib/homepage/hero-photo-manifest";

type HeroPhotoStyle = CSSProperties & {
  "--hero-position-desktop": string;
  "--hero-position-mobile": string;
};

export function HeroPhotoCarousel() {
  const style: HeroPhotoStyle = {
    "--hero-position-desktop": HERO_FEATURED_PHOTO.objectPositionDesktop,
    "--hero-position-mobile": HERO_FEATURED_PHOTO.objectPositionMobile,
  };

  return (
    <figure className="weekendoog-hero-photo-frame">
      <Image
        src={HERO_FEATURED_PHOTO.src}
        alt={HERO_FEATURED_PHOTO.alt}
        fill
        preload
        sizes="100vw"
        className="weekendoog-hero-photo"
        style={style}
      />
      <div className="weekendoog-hero-photo-gradient" aria-hidden="true" />
      <figcaption className="weekendoog-hero-photo-caption">
        부산 광안대교 전망
      </figcaption>
    </figure>
  );
}
