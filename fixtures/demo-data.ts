import { evaluatePetAccess } from "@/lib/pet-access/evaluator";
import type { AlternativePlace, Itinerary, ItineraryStop } from "@/types/itinerary";
import type { LicenseVerification } from "@/types/license";
import type { PetPlace } from "@/types/place";
import type { PetProfile, TravelPreferences } from "@/types/pet";

const RETRIEVED_AT = "2026-07-30T09:00:00.000Z";
const SOURCE_NAME = "KorPetTourService2 형식 로컬 데모 픽스처";

export const demoProfile: PetProfile = {
  id: "demo-bori",
  name: "보리",
  species: "DOG",
  size: "SMALL",
  hasCarrier: true,
  hasLeash: true,
  hasMuzzle: false,
  acceptsOutdoorOnly: true,
};

export const demoPreferences: TravelPreferences = {
  regionCode: "26",
  regionName: "부산",
  districtCode: "16",
  districtName: "해운대구",
  tripDate: "2026-08-15",
  tripType: "DAY_TRIP",
  startTime: "10:00",
  preferredCategories: ["ATTRACTION", "RESTAURANT", "CAFE"],
};

const notApplicableLicense: LicenseVerification = {
  status: "NOT_APPLICABLE",
  reason: "관광지는 음식점·숙박업 인허가 확인 대상이 아니에요.",
  sourceName: "지방행정 인허가 데이터",
};

function makePlace(
  input: Omit<PetPlace, "accessAssessment" | "source">,
): PetPlace {
  return {
    ...input,
    accessAssessment: evaluatePetAccess(demoProfile, input.petPolicy, {
      sourceName: SOURCE_NAME,
      retrievedAt: RETRIEVED_AT,
      phone: input.phone,
    }),
    source: {
      sourceName: SOURCE_NAME,
      retrievedAt: RETRIEVED_AT,
      modifiedAt: "2026-07-25T03:30:00.000Z",
      isDemo: true,
    },
  };
}

export const demoPlaces: PetPlace[] = [
  makePlace({
    contentId: "demo-busan-coast-walk",
    contentTypeId: "12",
    name: "청사포 바다 산책길",
    category: "ATTRACTION",
    address: "부산 해운대구 청사포로 000",
    coordinates: { latitude: 35.1596, longitude: 129.1917 },
    phone: "051-000-1001",
    summary: "바다와 철길 풍경을 따라 천천히 걷는 첫 번째 코스예요.",
    openingHours: "상시 개방",
    closedDays: "연중무휴",
    parking: "인근 공영주차장 이용",
    petPolicy: {
      allowedSpecies: ["DOG"],
      allowedSizes: [],
      allowedAreas: ["전 구역"],
      requiredItems: ["목줄"],
      restrictions: ["전 구역에서 목줄 착용"],
      originalText: "반려견은 전 구역 동반 가능하며 목줄 착용 필수",
      isAmbiguous: false,
    },
    licenseVerification: notApplicableLicense,
  }),
  makePlace({
    contentId: "demo-busan-terrace-table",
    contentTypeId: "39",
    name: "마린 테라스 식탁",
    category: "RESTAURANT",
    address: "부산 해운대구 달맞이길 000",
    coordinates: { latitude: 35.1582, longitude: 129.1782 },
    phone: "051-000-2002",
    summary: "야외 테라스에서 제철 한 끼를 즐기는 데모 음식점이에요.",
    openingHours: "11:30–20:30 · 브레이크 15:00–17:00",
    closedDays: "매주 화요일",
    parking: "건물 주차장 2시간",
    petPolicy: {
      allowedSpecies: ["DOG"],
      allowedSizes: ["SMALL"],
      allowedAreas: ["야외 테라스"],
      requiredItems: ["이동장"],
      restrictions: ["야외 테라스만 이용", "소형견만 동반"],
      originalText:
        "소형 반려견은 야외 테라스에 한해 동반 가능하며 이동장 사용 필수",
      isAmbiguous: false,
    },
    licenseVerification: {
      status: "VERIFIED_ACTIVE",
      reason: "데모 인허가 레코드에서 영업 상태가 일치하는 항목을 확인했어요.",
      matchedBusinessName: "마린 테라스 식탁",
      matchedAddress: "부산 해운대구 달맞이길 000",
      verifiedAt: RETRIEVED_AT,
      sourceName: "지방행정 인허가 데이터 형식 데모 픽스처",
    },
  }),
  makePlace({
    contentId: "demo-busan-mint-cafe",
    contentTypeId: "39",
    name: "민트 파도 카페",
    category: "CAFE",
    address: "부산 해운대구 해운대해변로 000",
    coordinates: { latitude: 35.159, longitude: 129.1603 },
    phone: "051-000-3003",
    summary: "여행을 정리하며 쉬어 가는 마지막 데모 카페예요.",
    openingHours: "10:00–21:00",
    closedDays: "휴무 정보 미확인",
    parking: "주차 정보 미확인",
    petPolicy: {
      allowedSpecies: [],
      allowedSizes: [],
      allowedAreas: [],
      requiredItems: [],
      restrictions: [],
      originalText: "반려동물 동반 가능, 자세한 사항은 전화 문의",
      isAmbiguous: true,
    },
    licenseVerification: {
      status: "NO_MATCH",
      reason:
        "데모 인허가 데이터에서 일치 항목을 찾지 못했어요. 미등록 또는 불법 영업을 의미하지 않아요.",
      sourceName: "지방행정 인허가 데이터 형식 데모 픽스처",
    },
  }),
  makePlace({
    contentId: "demo-busan-garden-cafe",
    contentTypeId: "39",
    name: "동백 정원 카페",
    category: "CAFE",
    address: "부산 해운대구 동백로 000",
    coordinates: { latitude: 35.1535, longitude: 129.1521 },
    phone: "051-000-4004",
    summary: "이동장을 지참한 소형견이 실내에 머물 수 있는 대체 데모 카페예요.",
    openingHours: "09:30–20:00",
    closedDays: "매월 첫째 월요일",
    parking: "인근 유료주차장",
    petPolicy: {
      allowedSpecies: ["DOG"],
      allowedSizes: ["SMALL"],
      allowedAreas: ["실내 지정석"],
      requiredItems: ["이동장"],
      restrictions: ["실내 지정석 이용", "소형견만 동반"],
      originalText:
        "소형 반려견은 이동장 사용 시 실내 지정석에 동반 가능",
      isAmbiguous: false,
    },
    licenseVerification: {
      status: "VERIFIED_ACTIVE",
      reason: "데모 인허가 레코드에서 영업 상태가 일치하는 항목을 확인했어요.",
      matchedBusinessName: "동백 정원 카페",
      matchedAddress: "부산 해운대구 동백로 000",
      verifiedAt: RETRIEVED_AT,
      sourceName: "지방행정 인허가 데이터 형식 데모 픽스처",
    },
  }),
  makePlace({
    contentId: "demo-busan-night-stay",
    contentTypeId: "32",
    name: "오션 펫 스테이",
    category: "ACCOMMODATION",
    address: "부산 수영구 광안해변로 000",
    coordinates: { latitude: 35.1531, longitude: 129.1187 },
    phone: "051-000-5005",
    summary: "향후 1박 일정 확장을 보여 주는 데모 숙소예요.",
    openingHours: "체크인 15:00 · 체크아웃 11:00",
    closedDays: "연중 운영",
    parking: "객실당 1대",
    petPolicy: {
      allowedSpecies: ["DOG"],
      allowedSizes: ["SMALL"],
      allowedAreas: ["펫 전용 객실"],
      requiredItems: ["이동장"],
      restrictions: ["펫 전용 객실만 이용", "소형견만 동반"],
      originalText:
        "소형 반려견은 이동장 지참 시 펫 전용 객실에 동반 가능",
      isAmbiguous: false,
    },
    licenseVerification: {
      status: "NEEDS_CONFIRMATION",
      reason: "주소 형식이 달라 동일 업소인지 추가 확인이 필요해요.",
      sourceName: "지방행정 인허가 데이터 형식 데모 픽스처",
    },
  }),
];

const coast = demoPlaces[0];
const restaurant = demoPlaces[1];
const cafe = demoPlaces[2];
const alternativeCafe = demoPlaces[3];

const cafeAlternative: AlternativePlace = {
  place: alternativeCafe,
  distanceKm: 1.4,
  reason: "같은 카페 유형이며 동반 조건이 더 구체적으로 확인돼요.",
};

function stop(
  id: string,
  place: PetPlace,
  arrival: string,
  departure: string,
  travel?: { km: number; minutes: number },
  alternatives: AlternativePlace[] = [],
): ItineraryStop {
  return {
    id,
    place,
    plannedArrival: arrival,
    plannedDeparture: departure,
    durationMinutes: 60,
    distanceFromPreviousKm: travel?.km,
    driveMinutesFromPrevious: travel?.minutes,
    accessAssessment: place.accessAssessment,
    alternatives,
  };
}

export const demoItinerary: Itinerary = {
  id: "demo-busan-day-trip",
  title: "보리와 부산 바다 하루",
  preferences: demoPreferences,
  stops: [
    stop("stop-coast", coast, "10:00", "11:15"),
    stop("stop-lunch", restaurant, "11:40", "13:00", { km: 2.1, minutes: 12 }),
    stop(
      "stop-cafe",
      cafe,
      "14:00",
      "15:00",
      { km: 2.7, minutes: 16 },
      [cafeAlternative],
    ),
  ],
  totalDistanceKm: 4.8,
  totalDriveMinutes: 28,
  requiredItems: ["목줄", "이동장"],
  createdAt: RETRIEVED_AT,
  updatedAt: RETRIEVED_AT,
  isDemo: true,
};

export function getDemoPlace(contentId: string): PetPlace | undefined {
  return demoPlaces.find((place) => place.contentId === contentId);
}
