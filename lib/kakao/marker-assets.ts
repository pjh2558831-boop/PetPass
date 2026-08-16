export const SOURCE_MARKER_SOURCES = [
  "tourism",
  "kakao_candidate",
  "veterinary",
  "pet_shop",
] as const;

export type SourceMarkerSource = (typeof SOURCE_MARKER_SOURCES)[number];

export interface SourceMarkerAsset {
  path: string;
  accessibleLabel: string;
  normal: { width: number; height: number; anchorX: number; anchorY: number };
  selected: { width: number; height: number; anchorX: number; anchorY: number };
}

const NORMAL_SIZE = { width: 42, height: 51, anchorX: 21, anchorY: 50 } as const;
const SELECTED_SIZE = { width: 46, height: 56, anchorX: 23, anchorY: 55 } as const;

export const SOURCE_MARKER_ASSETS: Record<SourceMarkerSource, SourceMarkerAsset> = {
  tourism: {
    path: "/map-pins/tourism-official.svg",
    accessibleLabel: "한국관광공사 장소",
    normal: NORMAL_SIZE,
    selected: SELECTED_SIZE,
  },
  kakao_candidate: {
    path: "/map-pins/kakao-candidate.svg",
    accessibleLabel: "카카오 검색 후보",
    normal: NORMAL_SIZE,
    selected: SELECTED_SIZE,
  },
  veterinary: {
    path: "/map-pins/veterinary.svg",
    accessibleLabel: "동물병원",
    normal: NORMAL_SIZE,
    selected: SELECTED_SIZE,
  },
  pet_shop: {
    path: "/map-pins/pet-shop.svg",
    accessibleLabel: "펫샵·용품점",
    normal: NORMAL_SIZE,
    selected: SELECTED_SIZE,
  },
};

export function getSourceMarkerAsset(source: SourceMarkerSource): SourceMarkerAsset {
  return SOURCE_MARKER_ASSETS[source];
}
