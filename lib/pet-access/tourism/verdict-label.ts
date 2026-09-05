import type { RegionId } from "@/types/region";
import type { TourPetAccessVerdict } from "@/types/tour-pet-access";

export function tourPetAccessVerdictLabel(
  verdict: TourPetAccessVerdict,
  regionId: RegionId,
): string {
  void verdict;
  void regionId;
  return "반려동물 동반 가능";
}
