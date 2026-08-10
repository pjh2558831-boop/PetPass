import { parseKakaoPlaceUrl } from "@/lib/kakao/place-url";
import {
  ITINERARY_PROFILES,
  type GeneratedItinerary,
  type GeneratedItineraryStop,
  type PetEquipmentAvailability,
} from "@/types/route-generation";
import type { Coordinates } from "@/types/place";
import type {
  TourPetAccessCondition,
  TourPetAccessConditionType,
  TourPetAccessVerdict,
} from "@/types/tour-pet-access";

export const GENERATED_PET_VERDICT_COPY = {
  allowed: {
    label: "반려동물 동반 가능",
    description: "제공된 원문에서 반려동물 동반 가능 근거를 확인했습니다.",
  },
  conditional: {
    label: "조건부 동반 가능",
    description: "제공된 원문에 표시된 동반 조건을 지켜야 합니다.",
  },
  not_allowed: {
    label: "반려동물 동반 불가",
    description: "제공된 원문에서 동반 불가로 안내되어 이 경로를 사용할 수 없습니다.",
  },
  unknown: {
    label: "방문 전 확인 필요",
    description: "동반 여부를 확정할 근거가 부족해 방문 전에 시설에 확인해야 합니다.",
  },
} as const satisfies Record<
  TourPetAccessVerdict,
  { label: string; description: string }
>;

export interface ItineraryRouteMetrics {
  stopCount: number;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  estimatedElapsedDurationMinutes: number;
}

export type ItineraryVerdictCounts = Record<TourPetAccessVerdict, number>;

const EQUIPMENT_KEY_BY_CONDITION = {
  carrier_required: "hasCarrier",
  leash_required: "hasLeash",
  muzzle_required: "hasMuzzle",
} as const satisfies Partial<
  Record<TourPetAccessConditionType, keyof PetEquipmentAvailability>
>;

export type SupportedEquipmentCondition =
  keyof typeof EQUIPMENT_KEY_BY_CONDITION;

export type EquipmentRequirementStatus =
  | "available"
  | "missing"
  | "unknown";

export interface EquipmentRequirementPresentation {
  condition: TourPetAccessCondition & { type: SupportedEquipmentCondition };
  equipmentKey: keyof PetEquipmentAvailability;
  availability: boolean | null;
  status: EquipmentRequirementStatus;
}

export interface StopConfirmationPresentation {
  callAheadRequired: boolean;
  manualConditions: TourPetAccessCondition[];
  verificationItems: NonNullable<
    GeneratedItineraryStop["petAccess"]["verificationItems"]
  >;
  assessmentWarnings: NonNullable<
    GeneratedItineraryStop["petAccess"]["warnings"]
  >;
  sizeVerificationRequired: boolean;
  operatingHoursWarning: GeneratedItineraryStop["operatingHours"]["warning"];
  hasConfirmationRequirements: boolean;
}

export interface StopPresentation {
  stop: GeneratedItineraryStop;
  equipmentRequirements: EquipmentRequirementPresentation[];
  confirmation: StopConfirmationPresentation;
  detailHref: string | null;
}

export interface ItineraryPresentation {
  itinerary: GeneratedItinerary;
  strategyOrder: number;
  metrics: ItineraryRouteMetrics;
  verdictCounts: ItineraryVerdictCounts;
  blockedByPetAccess: boolean;
  geometry: Coordinates[];
  stops: StopPresentation[];
}

export function getItineraryRouteMetrics(
  itinerary: GeneratedItinerary,
): ItineraryRouteMetrics {
  return {
    stopCount: itinerary.stops.length,
    totalDistanceMeters: itinerary.totalDistanceMeters,
    totalDurationSeconds: itinerary.totalDurationSeconds,
    estimatedElapsedDurationMinutes:
      itinerary.estimatedElapsedDurationMinutes,
  };
}

export function countItineraryVerdicts(
  stops: readonly GeneratedItineraryStop[],
): ItineraryVerdictCounts {
  const counts: ItineraryVerdictCounts = {
    allowed: 0,
    conditional: 0,
    not_allowed: 0,
    unknown: 0,
  };
  for (const stop of stops) counts[stop.petAccess.verdict] += 1;
  return counts;
}

export function isItineraryBlockedByPetAccess(
  stops: readonly GeneratedItineraryStop[],
): boolean {
  return stops.some(({ petAccess }) => petAccess.verdict === "not_allowed");
}

function isValidCoordinate(coordinate: unknown): coordinate is Coordinates {
  if (!coordinate || typeof coordinate !== "object") return false;
  const candidate = coordinate as Partial<Coordinates>;
  return (
    typeof candidate.latitude === "number" &&
    Number.isFinite(candidate.latitude) &&
    candidate.latitude >= -90 &&
    candidate.latitude <= 90 &&
    typeof candidate.longitude === "number" &&
    Number.isFinite(candidate.longitude) &&
    candidate.longitude >= -180 &&
    candidate.longitude <= 180
  );
}

export function getRenderableRouteGeometry(
  geometry: readonly unknown[],
): Coordinates[] {
  if (geometry.length < 2 || !geometry.every(isValidCoordinate)) return [];
  return geometry.map((coordinate) => ({ ...coordinate }));
}

function isSupportedEquipmentCondition(
  condition: TourPetAccessCondition,
): condition is TourPetAccessCondition & {
  type: SupportedEquipmentCondition;
} {
  return condition.type in EQUIPMENT_KEY_BY_CONDITION;
}

export function getStopEquipmentRequirements(
  stop: GeneratedItineraryStop,
  equipment: PetEquipmentAvailability,
): EquipmentRequirementPresentation[] {
  return stop.petAccess.conditions
    .filter(isSupportedEquipmentCondition)
    .map((condition) => {
      const equipmentKey = EQUIPMENT_KEY_BY_CONDITION[condition.type];
      const availability = equipment[equipmentKey];
      return {
        condition,
        equipmentKey,
        availability,
        status:
          availability === true
            ? "available"
            : availability === false
              ? "missing"
              : "unknown",
      };
    });
}

export function getStopConfirmationRequirements(
  stop: GeneratedItineraryStop,
): StopConfirmationPresentation {
  const manualConditions = stop.petAccess.conditions.filter(
    ({ manualConfirmationRecommended }) => manualConfirmationRecommended,
  );
  const verificationItems = stop.petAccess.verificationItems ?? [];
  const assessmentWarnings = stop.petAccess.warnings ?? [];
  const sizeVerificationRequired =
    stop.petAccess.sizeCompatibility.state === "verification_required";
  const operatingHoursWarning = stop.operatingHours.warning;
  return {
    callAheadRequired: stop.callAheadRequired,
    manualConditions,
    verificationItems,
    assessmentWarnings,
    sizeVerificationRequired,
    operatingHoursWarning,
    hasConfirmationRequirements:
      stop.callAheadRequired ||
      manualConditions.length > 0 ||
      verificationItems.length > 0 ||
      assessmentWarnings.length > 0 ||
      sizeVerificationRequired ||
      operatingHoursWarning !== null,
  };
}

export function getStopDetailHref(
  stop: GeneratedItineraryStop,
): string | null {
  if (stop.source !== "TOUR_API") return parseKakaoPlaceUrl(stop.placeUrl);
  return `/places/${encodeURIComponent(stop.contentId)}?contentTypeId=${encodeURIComponent(
    stop.contentTypeId,
  )}`;
}

export function formatKoreanDurationMinutes(
  totalMinutes: number,
): string | null {
  if (!Number.isInteger(totalMinutes) || totalMinutes < 0) return null;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}분`;
  return minutes === 0
    ? `${hours}시간`
    : `${hours}시간 ${minutes}분`;
}

export function createItineraryPresentation(
  itinerary: GeneratedItinerary,
  equipment: PetEquipmentAvailability,
): ItineraryPresentation {
  const verdictCounts = countItineraryVerdicts(itinerary.stops);
  return {
    itinerary,
    strategyOrder: ITINERARY_PROFILES.indexOf(itinerary.profile),
    metrics: getItineraryRouteMetrics(itinerary),
    verdictCounts,
    blockedByPetAccess: verdictCounts.not_allowed > 0,
    geometry: getRenderableRouteGeometry(itinerary.geometry),
    stops: itinerary.stops.map((stop) => ({
      stop,
      equipmentRequirements: getStopEquipmentRequirements(stop, equipment),
      confirmation: getStopConfirmationRequirements(stop),
      detailHref: getStopDetailHref(stop),
    })),
  };
}
