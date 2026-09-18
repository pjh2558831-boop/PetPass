import { z } from "zod";
import {
  PUBLIC_MAP_PET_ACCESS_VERDICTS,
  PUBLIC_MAP_PLACE_CATEGORIES,
} from "@/types/public-map-place";
import { REGION_IDS, type RegionId } from "@/types/region";
import type { TourCatalogCategory } from "@/lib/tour-api/catalog";
import type { PublicCatalogPlace } from "@/types/public-catalog-place";
import { getRegionConfig } from "@/lib/regions/config";
import {
  createPlanDraft,
  loadPlanDraft,
  savePlanDraft,
  updatePlanDraftSelection,
} from "@/lib/storage/plan-draft-storage";
import {
  readVersionedValue,
  type StorageLike,
} from "@/lib/storage/versioned-storage";

const STORAGE_VERSION = 3;
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
  imageUrl: z.string().url().nullable().default(null),
});

const selectedItinerarySnapshotSchema = z.object({
  regionId: z.enum(REGION_IDS),
  autoFill: z.boolean(),
  includeVerificationRequired: z.boolean(),
  places: z.array(selectedItineraryPlaceSchema).max(MAX_SELECTED_ITINERARY_PLACES),
  acknowledgedVerificationRequiredPlaceIds: z.array(
    z.string().regex(/^(?:tour|kakao):[0-9]+$/u),
  ).max(MAX_SELECTED_ITINERARY_PLACES),
}).superRefine((value, context) => {
  const ids = value.places.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["places"], message: "Duplicate selected place" });
  }
  if (value.places.some(({ regionId }) => regionId !== value.regionId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["places"], message: "Cross-region selected place" });
  }
  const selectedIds = new Set(ids);
  if (value.acknowledgedVerificationRequiredPlaceIds.some((id) => !selectedIds.has(id))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["acknowledgedVerificationRequiredPlaceIds"], message: "Acknowledged place is not selected" });
  }
});

export type SelectedItineraryPlace = z.infer<typeof selectedItineraryPlaceSchema>;
export type SelectedItinerarySnapshot = z.infer<typeof selectedItinerarySnapshotSchema>;

export type AddSelectedItineraryPlaceResult = {
  status:
    | "selected"
    | "already_selected"
    | "limit_reached"
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
  return {
    regionId,
    autoFill: getRegionConfig(regionId).routeCapabilities.automaticFill,
    includeVerificationRequired: false,
    places: [],
    acknowledgedVerificationRequiredPlaceIds: [],
  };
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
    imageUrl: place.imageUrl,
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
    acknowledgedVerificationRequiredPlaceIds:
      snapshot.acknowledgedVerificationRequiredPlaceIds.filter((id) => id !== placeId),
  };
}

export function setSelectedItineraryVerificationAcknowledged(
  snapshot: SelectedItinerarySnapshot,
  placeId: string,
  acknowledged: boolean,
): SelectedItinerarySnapshot {
  const place = snapshot.places.find(({ id }) => id === placeId);
  const ids = new Set(snapshot.acknowledgedVerificationRequiredPlaceIds);
  if (acknowledged && place && selectedItineraryNeedsWarning(place)) ids.add(placeId);
  else ids.delete(placeId);
  return {
    ...snapshot,
    acknowledgedVerificationRequiredPlaceIds: [...ids].sort(),
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
  const draft = loadPlanDraft(storage);
  if (draft) {
    return selectedItinerarySnapshotSchema.parse({
      regionId: draft.regionId,
      autoFill: draft.autoFill,
      includeVerificationRequired: false,
      places: draft.selectedPlaces.map((place) => ({
        id: place.id,
        regionId: place.regionId,
        providerPlaceId: place.providerPlaceId,
        name: place.name,
        layer: place.layer,
        category: place.category,
        sourceLabel: place.sourceLabel,
        publicLabel: place.evidence.label,
        petAccessVerdict: place.evidence.verdict,
        imageUrl: null,
      })),
      acknowledgedVerificationRequiredPlaceIds:
        draft.acknowledgedVerificationRequiredPlaceIds,
    });
  }
  const snapshot = readVersionedValue(STORAGE_KEY, selectedItinerarySnapshotSchema, {
    version: STORAGE_VERSION,
    migrations: {
      1: (value) => value && typeof value === "object"
        ? { ...value, acknowledgedVerificationRequiredPlaceIds: [] }
        : value,
      2: (value) => value && typeof value === "object"
        ? { ...value, includeVerificationRequired: false }
        : value,
    },
    storage,
  });
  return snapshot ? { ...snapshot, includeVerificationRequired: false } : null;
}

export function saveSelectedItinerary(
  snapshot: SelectedItinerarySnapshot,
  storage?: StorageLike | null,
): boolean {
  const parsed = selectedItinerarySnapshotSchema.safeParse({
    ...snapshot,
    includeVerificationRequired: false,
  });
  if (!parsed.success) return false;
  const currentDraft = loadPlanDraft(storage) ?? createPlanDraft(parsed.data.regionId);
  return savePlanDraft(updatePlanDraftSelection(currentDraft, parsed.data), storage);
}

export function selectedItineraryVerdictLabel(
  verdict: SelectedItineraryPlace["petAccessVerdict"],
): string {
  void verdict;
  return "반려동물 동반 가능";
}

export function replaceSelectedItineraryPlace(
  snapshot: SelectedItinerarySnapshot,
  placeId: string,
  replacement: SelectedItineraryPlace,
): SelectedItinerarySnapshot | null {
  const index = snapshot.places.findIndex(({ id }) => id === placeId);
  if (
    index < 0 ||
    replacement.regionId !== snapshot.regionId ||
    snapshot.places.some(({ id }) => id === replacement.id && id !== placeId)
  ) return null;
  const places = [...snapshot.places];
  places[index] = replacement;
  return {
    ...snapshot,
    places,
    acknowledgedVerificationRequiredPlaceIds:
      snapshot.acknowledgedVerificationRequiredPlaceIds.filter((id) => id !== placeId),
  };
}

export function selectedItineraryNeedsWarning(place: SelectedItineraryPlace): boolean {
  void place;
  return false;
}
