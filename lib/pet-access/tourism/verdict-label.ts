import { TOUR_PET_ACCESS_VERDICT_LABELS } from "@/lib/pet-access/tourism/constants";
import type { RegionId } from "@/types/region";
import type { TourPetAccessVerdict } from "@/types/tour-pet-access";

const JEJU_MAP_VERDICT_LABELS: Partial<Record<TourPetAccessVerdict, string>> = {
  conditional: "동반 조건 확인 필요",
  unknown: "동반 정보 확인 필요",
};

export function tourPetAccessVerdictLabel(
  verdict: TourPetAccessVerdict,
  regionId: RegionId,
): string {
  return regionId === "jeju"
    ? JEJU_MAP_VERDICT_LABELS[verdict] ?? TOUR_PET_ACCESS_VERDICT_LABELS[verdict]
    : TOUR_PET_ACCESS_VERDICT_LABELS[verdict];
}
