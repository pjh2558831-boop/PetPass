import { z } from "zod";
import {
  PUBLIC_MAP_PET_ACCESS_VERDICTS,
  PUBLIC_MAP_PLACE_CATEGORIES,
} from "@/types/public-map-place";
import { REGION_IDS, type RegionId } from "@/types/region";
import type { TourCatalogCategory } from "@/lib/tour-api/catalog";
import type { PublicCatalogPlace } from "@/types/public-catalog-place";
import {
  readVersionedValue,
  writeVersionedValue,
  type StorageLike,
} from "@/lib/storage/versioned-storage";

const STORAGE_VERSION = 1;
const STORAGE_KEY = "weekendog:selected-itinerary";

export const MAX_SELECTED_ITINERARY_PLACES = 5;

const selectedItineraryPlaceSchema = z.object({
  id: z.string().regex(/^(?:tour|kakao):[0-9]+$/u),
  regionId: z.enum(REGION_IDS),
  providerPlaceId: z.string().min(1),
  name: z.string().trim().min(1).max(150),
  layer: z.enum(["tourism", "kakao", "veterinary", "pet_shop"]),
  category: z.enum(PUBLIC_MAP_PLACE_CATEGORIES),
  sourceLabel: z.enum([
    "한국관광공사",
    "카카오 검색 후보",
    "동물병원",
    "펫샵·용품점",
  ]),
  publicLabel: z.string().trim().min(1).max(120),
  petAccessVerdict: z.enum(PUBLIC_MAP_PET_ACCESS_VERDICTS),
});

const selectedItinerarySnapshotSchema = z.object({
  regionId: z.enum(REGION_IDS),
  autoFill: z.boolean(),
  places: z.array(selectedItineraryPlaceSchema).max(MAX_SELECTED_ITINERARY_PLACES),
}).superRefine((value, context) => {
  const ids = value.places.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["places"], message: "Duplicate selected place" });
  }
  if (value.places.some(({ regionId }) => regionId !== value.regionId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["places"], message: "Cross-region selected place" });
  }
});

export type SelectedItineraryPlace = z.infer<typeof selectedItineraryPlaceSchema>;
export type SelectedItinerarySnapshot = z.infer<typeof selectedItinerarySnapshotSchema>;

export type AddSelectedItineraryPlaceResult = {
  status:
    | "selected"
    | "already_selected"
    | "limit_reached"
    | "blocked_not_allowed"
    | "blocked_unsupported"
    | "region_mismatch";
  snapshot: SelectedItinerarySnapshot;
};

const SELECTED_CATEGORY_MAP: Partial<Record<SelectedItineraryPlace["category"], TourCatalogCategory>> = {
  attraction: "attraction",
  park_walk: "leisure",
  leisure: "leisure",
  camping: "leisure",
  food: "food",
  cafe: "food",
  accommodation: "accommodation",
  shopping: "shopping",
};

export function createSelectedItinerarySnapshot(
  regionId: RegionId,
): SelectedItinerarySnapshot {
  return { regionId, autoFill: true, places: [] };
}

export function selectedItineraryPlaceFromCatalog(
  place: PublicCatalogPlace,
): SelectedItineraryPlace {
  return {
    id: place.id,
    regionId: place.regionId,
    providerPlaceId: place.providerPlaceId,
    name: place.name,
    layer: place.layer,
    category: place.category,
    sourceLabel: place.sourceLabel,
    publicLabel: place.publicLabel,
    petAccessVerdict: place.petAccessVerdict ?? "unknown",
  };
}

export function addSelectedItineraryPlace(
  snapshot: SelectedItinerarySnapshot,
  place: SelectedItineraryPlace,
): AddSelectedItineraryPlaceResult {
  if (snapshot.places.some(({ id }) => id === place.id)) {
    return { status: "already_selected", snapshot };
  }
  if (place.regionId !== snapshot.regionId) {
    return { status: "region_mismatch", snapshot };
  }
  if (place.petAccessVerdict === "not_allowed") {
    return { status: "blocked_not_allowed", snapshot };
  }
  if (
    (place.layer !== "tourism" && place.layer !== "kakao") ||
    !SELECTED_CATEGORY_MAP[place.category]
  ) {
    return { status: "blocked_unsupported", snapshot };
  }
  if (snapshot.places.length >= MAX_SELECTED_ITINERARY_PLACES) {
    return { status: "limit_reached", snapshot };
  }
  return {
    status: "selected",
    snapshot: { ...snapshot, places: [...snapshot.places, place] },
  };
}

export function removeSelectedItineraryPlace(
  snapshot: SelectedItinerarySnapshot,
  placeId: string,
): SelectedItinerarySnapshot {
  return {
    ...snapshot,
    places: snapshot.places.filter(({ id }) => id !== placeId),
  };
}

export function requiresSelectionRegionClear(
  snapshot: SelectedItinerarySnapshot,
  nextRegionId: RegionId,
): boolean {
  return snapshot.places.length > 0 && snapshot.regionId !== nextRegionId;
}

export function getSelectedItineraryCategories(
  places: readonly SelectedItineraryPlace[],
): TourCatalogCategory[] {
  const categories = places.flatMap(({ category }) => {
    const mapped = SELECTED_CATEGORY_MAP[category];
    return mapped ? [mapped] : [];
  });
  return [...new Set(categories)];
}

export function loadSelectedItinerary(
  storage?: StorageLike | null,
): SelectedItinerarySnapshot | null {
  return readVersionedValue(STORAGE_KEY, selectedItinerarySnapshotSchema, {
    version: STORAGE_VERSION,
    storage,
  });
}

export function saveSelectedItinerary(
  snapshot: SelectedItinerarySnapshot,
  storage?: StorageLike | null,
): boolean {
  return writeVersionedValue(STORAGE_KEY, snapshot, selectedItinerarySnapshotSchema, {
    version: STORAGE_VERSION,
    storage,
  });
}

export function selectedItineraryVerdictLabel(
  verdict: SelectedItineraryPlace["petAccessVerdict"],
): string {
  if (verdict === "allowed") return "동반 가능 근거 확인";
  if (verdict === "conditional") return "조건 확인 필요";
  if (verdict === "not_allowed") return "동반 불가";
  return "동반 여부 미확인";
}

export function selectedItineraryNeedsWarning(place: SelectedItineraryPlace): boolean {
  return place.petAccessVerdict !== "allowed";
}
