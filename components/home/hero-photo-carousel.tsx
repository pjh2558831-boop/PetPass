"use client";

import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { HERO_FEATURED_PHOTO } from "@/lib/homepage/hero-photo-manifest";

const photos = [
  { src: "/images/home/hero/coastal-dog-v4.webp", alt: "차창 밖으로 얼굴을 내민 골든리트리버와 푸른 해안도로 여행 풍경" },
  HERO_FEATURED_PHOTO,
];

export function HeroPhotoCarousel() {
  const [active, setActive] = useState(0);
  return <figure className="weekendoog-hero-photo-frame">
    <Image src={photos[active].src} alt={photos[active].alt} fill loading="eager" sizes="100vw" className="weekendoog-hero-photo" />
    <div className="home-hero-pages" role="group" aria-label="여행 이미지 선택">
      {photos.map((photo, index) => <button key={photo.src} type="button" aria-label={"여행 이미지 " + (index + 1)} aria-pressed={active === index} onClick={() => setActive(index)}>{String(index + 1).padStart(2, "0")}</button>)}
      <button type="button" aria-label="다음 여행 이미지" onClick={() => setActive((active + 1) % photos.length)}><ChevronRight size={23} aria-hidden="true" /></button>
    </div>
  </figure>;
}
