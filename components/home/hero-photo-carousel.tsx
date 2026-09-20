"use client";

import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

const photos = [
  { src: "/images/home/hero/weekendog-travel-map.png", alt: "반려견과 함께하는 여행 지도가 펼쳐진 일러스트" },
  { src: "/images/home/hero/weekendog-coastline.png", alt: "푸른 바다와 등대가 보이는 해안 여행 풍경" },
  { src: "/images/home/hero/12-busan-bay-dog.png", alt: "부산 광안대교와 바다를 바라보는 반려견" },
  { src: "/images/home/hero/13-gyeongju-dog.png", alt: "눈 내린 경주 전통 다리 앞에 선 반려견" },
  { src: "/images/home/hero/14-pet-travel-flatlay.png", alt: "여행 사진과 여권, 지도가 놓인 반려동물 여행 준비 장면" },
];

export function HeroPhotoCarousel() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setActive(value => (value + 1) % photos.length), 10000);
    return () => window.clearInterval(timer);
  }, []);
  return <figure className="weekendoog-hero-photo-frame">
    <Image key={photos[active].src} src={photos[active].src} alt={photos[active].alt} fill loading="eager" sizes="100vw" className="weekendoog-hero-photo" />
    <div className="home-hero-pages" role="group" aria-label="여행 이미지 선택">
      {photos.map((photo, index) => <button key={photo.src} type="button" aria-label={"여행 이미지 " + (index + 1)} aria-pressed={active === index} onClick={() => setActive(index)}>{String(index + 1).padStart(2, "0")}</button>)}
      <button type="button" aria-label="다음 여행 이미지" onClick={() => setActive((active + 1) % photos.length)}><ChevronRight size={23} aria-hidden="true" /></button>
    </div>
  </figure>;
}
