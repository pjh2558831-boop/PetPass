export type RecommendationProcessIcon =
  | "evidence"
  | "compare"
  | "schedule"
  | "travel-time"
  | "verify";

export interface RecommendationProcessStep {
  number: 1 | 2 | 3 | 4 | 5;
  title: string;
  description: string;
  icon: RecommendationProcessIcon;
}

export const WEEKENDOG_PROCESS_STEPS = [
  {
    number: 1,
    title: "공식 근거 확인",
    description: "한국관광공사의 반려동물 동반 근거를 확인합니다.",
    icon: "evidence",
  },
  {
    number: 2,
    title: "조건 비교",
    description: "내 반려견의 크기, 동반 조건, 운영시간을 비교합니다.",
    icon: "compare",
  },
  {
    number: 3,
    title: "일정 구성",
    description: "여행 스타일과 방문 시간을 고려해 일정을 구성합니다.",
    icon: "schedule",
  },
  {
    number: 4,
    title: "실제 이동시간 반영",
    description: "카카오 길찾기의 실제 이동시간으로 동선을 비교합니다.",
    icon: "travel-time",
  },
  {
    number: 5,
    title: "최종 경로 검증",
    description: "최종 경로를 다시 확인해 실행 가능한 일정을 완성합니다.",
    icon: "verify",
  },
] as const satisfies readonly RecommendationProcessStep[];

export interface EditorialCourseStop {
  time: string;
  title: string;
  note: string;
}

export const WEEKENDOG_EXAMPLE_COURSE = {
  eyebrow: "WEEKENDOG PICK",
  title: "이번 주말 추천 예시 코스",
  description:
    "산책과 식사, 휴식을 자연스럽게 잇는 하루의 흐름을 살펴보세요.",
  disclosure:
    "실제 개인화 결과가 아니며 장소·시간은 조건에 따라 달라집니다.",
  stops: [
    { time: "09:00", title: "바닷가 산책", note: "현장 안내 확인" },
    { time: "11:30", title: "점심 식사", note: "동반 조건 확인" },
    { time: "14:00", title: "여유로운 휴식", note: "운영시간 확인" },
    { time: "17:00", title: "마무리 산책", note: "귀가 동선 확인" },
  ],
} as const satisfies {
  eyebrow: string;
  title: string;
  description: string;
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
    detail: "관광 장소와 반려동물 동반 원문",
    icon: "tourism",
  },
  {
    name: "Kakao Maps / Kakao Mobility",
    detail: "지도 표시와 자동차 이동시간",
    icon: "map",
  },
  {
    name: "행정안전부 공공데이터",
    detail: "확인 가능한 업종의 인허가 보조 정보",
    icon: "administration",
  },
] as const satisfies readonly PublicDataSourceItem[];
