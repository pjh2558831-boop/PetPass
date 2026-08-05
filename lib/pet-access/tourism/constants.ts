import type {
  TourPetAccessConditionType,
  TourPetAccessScope,
  TourPetAccessVerdict,
} from "@/types/tour-pet-access";
import type {
  TourContentTypeId,
  TourIntroPetPolicyField,
  TourPetPolicyFields,
} from "@/types/place";

export const PET_ACCESS_RULESET_VERSION = "1" as const;

export const PET_ACCESS_LIMITS = {
  sourceFieldCharacters: 2_000,
  evidenceWordingCharacters: 500,
  clausesPerField: 12,
  evidence: 24,
  conditions: 16,
  conflicts: 8,
  verificationItems: 8,
} as const;

export const VERIFIED_COMPANION_TYPE_CODES = {
  "전구역 동반가능": { assertion: "allows", scope: "whole_place" },
} as const;

export const INTRO_PET_FIELD_BY_CONTENT_TYPE: Partial<
  Record<TourContentTypeId, TourIntroPetPolicyField>
> = {
  "12": "chkpet",
  "14": "chkpetculture",
  "28": "chkpetleports",
  "38": "chkpetshopping",
};

export const PET_POLICY_FIELD_PRIORITY: Record<keyof TourPetPolicyFields, 1 | 2 | 4> = {
  acmpyTypeCd: 1,
  acmpyPsblCpam: 2,
  acmpyNeedMtr: 2,
  etcAcmpyInfo: 2,
  relaAcdntRiskMtr: 4,
  relaPosesFclty: 4,
  relaFrnshPrdlst: 4,
  relaPurcPrdlst: 4,
  relaRntlPrdlst: 4,
};

export const PET_POLICY_FIELD_LABELS: Record<keyof TourPetPolicyFields, string> = {
  acmpyTypeCd: "동반 유형",
  acmpyPsblCpam: "동반 가능 동물",
  acmpyNeedMtr: "동반 시 필요사항",
  etcAcmpyInfo: "기타 동반 정보",
  relaAcdntRiskMtr: "관련 사고 대비사항",
  relaPosesFclty: "관련 구비 시설",
  relaFrnshPrdlst: "관련 비치 품목",
  relaPurcPrdlst: "관련 구매 품목",
  relaRntlPrdlst: "관련 대여 품목",
};

export const INTRO_PET_FIELD_LABELS: Record<TourIntroPetPolicyField, string> = {
  chkpet: "반려동물 동반 가능 여부",
  chkpetculture: "문화시설 반려동물 동반 가능 여부",
  chkpetleports: "레포츠 반려동물 동반 가능 여부",
  chkpetshopping: "쇼핑시설 반려동물 동반 가능 여부",
};

export const TOUR_PET_ACCESS_VERDICT_LABELS: Record<TourPetAccessVerdict, string> = {
  allowed: "반려동물 동반 가능",
  conditional: "조건부 동반 가능",
  not_allowed: "반려동물 동반 불가로 안내됨",
  unknown: "반려동물 동반 여부 확인 필요",
};

export const TOUR_PET_ACCESS_SCOPE_LABELS: Record<TourPetAccessScope, string> = {
  whole_place: "전체 시설",
  indoor: "실내",
  outdoor: "야외",
  terrace: "테라스",
  guest_room: "객실",
  selected_room: "일부 지정 객실",
  common_area: "공용 공간",
  restaurant: "식당",
  cafe: "카페",
  lobby: "로비",
  designated_area: "지정 구역",
  transport: "이동·운송 구역",
  unknown: "범위 미상",
};

export const TOUR_PET_ACCESS_CONDITION_LABELS: Record<
  TourPetAccessConditionType,
  string
> = {
  size_limit: "크기 제한",
  weight_limit: "무게 제한",
  breed_limit: "견종 제한",
  dangerous_dog_limit: "맹견 제한",
  pet_count_limit: "동반 마릿수 제한",
  leash_required: "목줄 필요",
  harness_required: "하네스 필요",
  muzzle_required: "입마개 필요",
  carrier_required: "이동장·케이지 필요",
  stroller_required: "반려동물 유모차 필요",
  vaccination_required: "예방접종 필요",
  document_required: "증빙 서류 필요",
  reservation_required: "예약 필요",
  advance_inquiry_required: "사전 문의 필요",
  fee_required: "추가 요금 있음",
  deposit_required: "보증금 필요",
  designated_area_only: "지정 구역만 가능",
  outdoor_only: "야외만 가능",
  indoor_restricted: "실내 제한",
  selected_room_only: "일부 지정 객실만 가능",
  facility_restriction: "일부 시설 제한",
  time_restriction: "이용 시간 제한",
  owner_supervision: "보호자 관리 필요",
  sanitation_requirement: "위생 수칙 준수 필요",
  assistance_animal_exception: "보조견 예외",
  other: "기타 동반 조건",
};
