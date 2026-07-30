import { parsePetPolicy } from "@/lib/pet-access/parser";
import type { TourItem } from "@/lib/tour-api/schemas";
import type { PetPolicy } from "@/types/access";
import type { Coordinates } from "@/types/place";

export function normalizeCoordinates(item: TourItem): Coordinates | null {
  const longitude = Number(item.mapx);
  const latitude = Number(item.mapy);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return { latitude, longitude };
}

export function normalizePetPolicy(item: TourItem): PetPolicy {
  const sourceText = [
    item.acmpyPsblCpam,
    item.acmpyNeedMtr,
    item.etcAcmpyInfo,
    item.relaAcdntRiskMtr,
  ]
    .filter(Boolean)
    .join(" ");
  return parsePetPolicy(sourceText);
}
