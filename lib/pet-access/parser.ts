import type { PetPolicy } from "@/types/access";

const ITEM_RULES = ["이동장", "목줄", "입마개"] as const;

export function parsePetPolicy(sourceText: string): PetPolicy {
  const normalized = sourceText.trim();
  const requiredItems = ITEM_RULES.filter(
    (item) =>
      normalized.includes(`${item} 필수`) ||
      normalized.includes(`${item} 착용`) ||
      normalized.includes(`${item} 사용`),
  );

  const allowedSpecies: PetPolicy["allowedSpecies"] = [];
  if (normalized.includes("반려견") || normalized.includes("강아지")) {
    allowedSpecies.push("DOG");
  }
  if (normalized.includes("반려묘") || normalized.includes("고양이")) {
    allowedSpecies.push("CAT");
  }

  const allowedSizes: PetPolicy["allowedSizes"] = [];
  if (normalized.includes("소형견")) allowedSizes.push("SMALL");
  if (normalized.includes("중형견")) allowedSizes.push("MEDIUM");
  if (normalized.includes("대형견")) allowedSizes.push("LARGE");

  const allowedAreas: string[] = [];
  if (normalized.includes("야외")) allowedAreas.push("야외 공간");
  if (normalized.includes("실내")) allowedAreas.push("실내 공간");
  if (normalized.includes("전 구역")) allowedAreas.push("전 구역");

  const restrictions = [
    ...allowedAreas.map((area) => `${area} 이용`),
    ...allowedSizes.map((size) => `${size} 명시`),
  ];

  return {
    allowedSpecies,
    allowedSizes,
    allowedAreas,
    requiredItems: [...requiredItems],
    restrictions,
    originalText: normalized,
    isAmbiguous:
      normalized.length === 0 ||
      normalized === "반려동물 동반 가능" ||
      normalized.includes("문의"),
  };
}
