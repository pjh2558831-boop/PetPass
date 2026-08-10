import type { PlaceSourceLayerId } from "@/types/place-source";

export const PLACE_SOURCE_LAYERS = [
  {
    id: "tourism_official",
    label: "관광공사 공식 데이터",
    markerKind: "tourism-official",
    defaultVisible: true,
    description: "한국관광공사 KorPetTourService2 원문 장소",
  },
  {
    id: "business_confirmed",
    label: "업체 확인",
    markerKind: "business-confirmed",
    defaultVisible: true,
    description: "업체가 현재 정보를 직접 확인한 장소",
  },
  {
    id: "administrator_confirmed",
    label: "관리자 확인",
    markerKind: "administrator-confirmed",
    defaultVisible: true,
    description: "관리자가 근거와 날짜를 검토한 장소",
  },
  {
    id: "user_reported",
    label: "이용자 제보",
    markerKind: "user-reported",
    defaultVisible: false,
    description: "검토 상태와 관찰 날짜를 함께 표시하는 이용자 제보",
  },
  {
    id: "kakao_discovery",
    label: "카카오 검색 후보",
    markerKind: "kakao-candidate",
    defaultVisible: false,
    description: "반려동물 동반 여부를 별도로 확인해야 하는 검색 후보",
  },
] as const satisfies readonly {
  id: PlaceSourceLayerId;
  label: string;
  markerKind: string;
  defaultVisible: boolean;
  description: string;
}[];

export type SourceLayerVisibility = Record<PlaceSourceLayerId, boolean>;

export function createDefaultSourceLayerVisibility(): SourceLayerVisibility {
  return Object.fromEntries(
    PLACE_SOURCE_LAYERS.map(({ id, defaultVisible }) => [id, defaultVisible]),
  ) as SourceLayerVisibility;
}

export function getPlaceSourceLayer(layerId: PlaceSourceLayerId) {
  return PLACE_SOURCE_LAYERS.find(({ id }) => id === layerId)!;
}
