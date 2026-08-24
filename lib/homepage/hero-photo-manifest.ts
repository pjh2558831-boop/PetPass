export interface HeroPhoto {
  src: string;
  alt: string;
  objectPositionDesktop: string;
  objectPositionMobile: string;
}

export const HERO_PHOTOS = [
  {
    src: "/images/home/hero/01-corgi-tulips.png",
    alt: "노란 튤립밭 앞에서 초록 하네스를 입고 웃는 웰시코기",
    objectPositionDesktop: "50% 72%",
    objectPositionMobile: "50% 72%",
  },
  {
    src: "/images/home/hero/02-maltese-hanok.png",
    alt: "햇살이 비치는 한옥 담장 앞을 산책하는 흰색 말티즈",
    objectPositionDesktop: "48% 61%",
    objectPositionMobile: "48% 62%",
  },
  {
    src: "/images/home/hero/03-corgi-seaside-sunset.png",
    alt: "부산 바다의 주황빛 일몰을 배경으로 웃는 웰시코기",
    objectPositionDesktop: "48% 64%",
    objectPositionMobile: "48% 66%",
  },
  {
    src: "/images/home/hero/04-bichon-cherry-blossoms.png",
    alt: "벚꽃이 핀 산책길에 앉아 웃는 흰색 비숑",
    objectPositionDesktop: "50% 64%",
    objectPositionMobile: "50% 66%",
  },
  {
    src: "/images/home/hero/05-golden-retriever-beach-dusk.png",
    alt: "해 질 무렵 바닷가 모래사장에 앉아 웃는 골든리트리버",
    objectPositionDesktop: "50% 60%",
    objectPositionMobile: "50% 64%",
  },
  {
    src: "/images/home/hero/07-poodle-wooden-trail.png",
    alt: "푸른 언덕 옆 나무 산책로에 앉아 웃는 갈색 푸들",
    objectPositionDesktop: "47% 62%",
    objectPositionMobile: "47% 64%",
  },
  {
    src: "/images/home/hero/08-pug-temple.png",
    alt: "맑은 날 전통 사찰 앞에 앉아 웃는 퍼그",
    objectPositionDesktop: "49% 60%",
    objectPositionMobile: "49% 64%",
  },
  {
    src: "/images/home/hero/09-bichon-busan-overlook.png",
    alt: "광안대교와 부산 도심이 내려다보이는 바위 위의 흰색 비숑",
    objectPositionDesktop: "50% 68%",
    objectPositionMobile: "50% 69%",
  },
  {
    src: "/images/home/hero/10-pomeranian-gwangan-night.png",
    alt: "불이 켜진 광안대교 야경 앞에서 웃는 흰색 포메라니안",
    objectPositionDesktop: "50% 64%",
    objectPositionMobile: "50% 66%",
  },
  {
    src: "/images/home/hero/11-poodle-yellow-field.png",
    alt: "노란 꽃이 가득한 들판의 나무 데크에 앉아 웃는 푸들",
    objectPositionDesktop: "50% 65%",
    objectPositionMobile: "50% 67%",
  },
] as const satisfies readonly HeroPhoto[];

export const HERO_AUTOPLAY_INTERVAL_MS = 6_000;
export const HERO_CROSSFADE_DURATION_MS = 760;
