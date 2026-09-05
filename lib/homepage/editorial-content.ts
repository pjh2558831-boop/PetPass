export interface RecommendationProcessStep {
  number: 1 | 2 | 3;
  title: string;
  description: string;
}

export const WEEKENDOG_PROCESS_STEPS = [
  {
    number: 1,
    title: "여행 정보 입력",
    description: "반려견 정보와 부산 여행 조건을 입력합니다.",
  },
  {
    number: 2,
    title: "동반 가능한 장소 확인",
    description: "등록된 장소의 제공처와 실제 이용 조건을 함께 살펴봅니다.",
  },
  {
    number: 3,
    title: "이동시간을 반영한 맞춤 일정",
    description: "실제 이동시간과 방문 순서를 고려해 일정을 구성합니다.",
  },
] as const satisfies readonly RecommendationProcessStep[];

export interface EditorialCourseStop {
  time: string;
  title: string;
  note: string;
}

export const WEEKENDOG_EXAMPLE_COURSE = {
  label: "예시 코스",
  title: "부산에서 보내는 반려견과의 하루",
  description:
    "산책과 식사, 휴식을 자연스럽게 잇는 하루의 흐름을 살펴보세요.",
  imageSrc: "/images/home/hero/weekendog-busan-city-ver2.webp",
  imageAlt: "부산 해변과 광안대교, 해안 도심이 함께 보이는 전경",
  disclosure:
    "실제 개인화 결과가 아니며 장소·시간은 조건에 따라 달라집니다.",
  stops: [
    { time: "09:00", title: "바닷가 산책", note: "현장 안내 확인" },
    { time: "11:30", title: "점심 식사", note: "동반 조건 확인" },
    { time: "14:00", title: "여유로운 휴식", note: "운영시간 확인" },
    { time: "17:00", title: "마무리 산책", note: "귀가 동선 확인" },
  ],
} as const satisfies {
  label: string;
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  disclosure: string;
  stops: readonly EditorialCourseStop[];
};

export type PublicDataSourceIcon = "tourism" | "map" | "administration";

export interface PublicDataSourceItem {
  name: string;
  detail: string;
  icon: PublicDataSourceIcon;
}

export const WEEKENDOG_PUBLIC_DATA_SOURCES = [
  {
    name: "한국관광공사 Tour API",
    detail: "관광 장소와 반려동물 동반 정보",
    icon: "tourism",
  },
  {
    name: "Kakao Maps / Kakao Mobility",
    detail: "지도 표시와 실제 이동시간",
    icon: "map",
  },
  {
    name: "행정안전부 공공데이터",
    detail: "확인 가능한 업종의 인허가 보조 정보",
    icon: "administration",
  },
] as const satisfies readonly PublicDataSourceItem[];
