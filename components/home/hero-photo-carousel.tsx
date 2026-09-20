"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const photos = [
  { src: "/images/home/hero/weekendog-travel-map.png", alt: "반려견과 함께하는 여행 지도가 펼쳐진 일러스트" },
  { src: "/images/home/hero/weekendog-coastline.png", alt: "푸른 바다와 등대가 보이는 해안 여행 풍경" },
  { src: "/images/home/hero/12-busan-bay-dog.png", alt: "부산 광안대교와 바다를 바라보는 반려견" },
];

export function HeroPhotoCarousel() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setActive(value => (value + 1) % photos.length), 12000);
    return () => window.clearInterval(timer);
  }, []);
  return <figure className="weekendoog-hero-photo-frame">
    <Image key={photos[active].src} src={photos[active].src} alt={photos[active].alt} fill loading="eager" sizes="100vw" className="weekendoog-hero-photo" />
  </figure>;
}
