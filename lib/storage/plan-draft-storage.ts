import { z } from "zod";
import {
  getRegionConfig,
  getRegionConfigByService2LegalDongCode,
} from "@/lib/regions/config";
import {
  readVersionedValue,
  writeVersionedValue,
  type StorageLike,
} from "@/lib/storage/versioned-storage";
import {
  PUBLIC_MAP_PET_ACCESS_VERDICTS,
  PUBLIC_MAP_PLACE_CATEGORIES,
} from "@/types/public-map-place";
import { REGION_IDS, type RegionId } from "@/types/region";
import type { PetProfile, PlaceCategory, TravelPreferences } from "@/types/pet";

export const PLAN_DRAFT_SCHEMA_VERSION = 1;
export const PLAN_DRAFT_STORAGE_KEY = "weekendog:plan-draft";

const canonicalPlaceId = z.string().regex(/^(?:tour|kakao):[0-9]+$/u);
const requestedCategory = z.enum([
  "attraction",
  "culture",
  "festival",
  "leisure",
  "accommodation",
  "food",
  "shopping",
]);

const planDraftSelectedPlaceSchema = z.object({
  id: canonicalPlaceId,
  regionId: z.enum(REGION_IDS),
  providerPlaceId: z.string().trim().min(1).max(128),
  provider: z.enum(["kto", "kakao"]),
  name: z.string().trim().min(1).max(150),
  layer: z.enum(["tourism", "kakao", "veterinary", "pet_shop"]),
  category: z.enum(PUBLIC_MAP_PLACE_CATEGORIES),
  sourceLabel: z.enum([
    "한국관광공사",
    "카카오 검색 후보",
    "동물병원",
    "펫샵·용품점",
  ]),
  evidence: z.object({
    verdict: z.enum(PUBLIC_MAP_PET_ACCESS_VERDICTS),
    label: z.string().trim().min(1).max(120),
  }).strict(),
  locked: z.boolean(),
}).strict();

const draftPetProfileSchema = z.object({
  id: z.string().trim().min(1).max(128),
  name: z.string().trim().max(30),
  species: z.enum(["DOG", "CAT", "OTHER"]),
  size: z.enum(["SMALL", "MEDIUM", "LARGE"]),
  hasCarrier: z.boolean(),
  hasLeash: z.boolean(),
  hasMuzzle: z.boolean(),
  acceptsOutdoorOnly: z.boolean(),
}).strict();

const planDraftSchema = z.object({
  schemaVersion: z.literal(PLAN_DRAFT_SCHEMA_VERSION),
  regionId: z.enum(REGION_IDS),
  districtId: z.string().trim().min(1).max(20).nullable(),
  selectedPlaces: z.array(planDraftSelectedPlaceSchema).max(5),
  acknowledgedVerificationRequiredPlaceIds: z.array(canonicalPlaceId).max(5),
  petProfile: draftPetProfileSchema.nullable(),
  origin: z.object({
    name: z.string().trim().min(1).max(150),
    source: z.enum([
      "kakao_place_search",
      "address_search",
      "map_selection",
      "current_location",
    ]),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  }).strict().nullable(),
  travelDate: z.string().date().nullable(),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u).nullable(),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u).nullable(),
  requestedStopCount: z.number().int().min(1).max(5),
  pace: z.enum(["relaxed", "balanced", "packed"]),
  requestedCategories: z.array(requestedCategory).max(7),
  autoFill: z.boolean(),
  includeVerificationRequired: z.boolean(),
  tripType: z.enum(["day_trip", "overnight"]),
  roundTrip: z.boolean(),
}).strict().superRefine((draft, context) => {
  if (
    draft.districtId &&
    !getRegionConfig(draft.regionId).districts.some(
      ({ legalDongDistrictCode }) => legalDongDistrictCode === draft.districtId,
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["districtId"],
      message: "District does not belong to the selected region",
    });
  }
  const selectedIds = draft.selectedPlaces.map(({ id }) => id);
  if (new Set(selectedIds).size !== selectedIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["selectedPlaces"], message: "Duplicate selected place" });
  }
  if (draft.selectedPlaces.some(({ regionId }) => regionId !== draft.regionId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["selectedPlaces"], message: "Cross-region selected place" });
  }
  const selectedIdSet = new Set(selectedIds);
  if (draft.acknowledgedVerificationRequiredPlaceIds.some((id) => !selectedIdSet.has(id))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["acknowledgedVerificationRequiredPlaceIds"],
      message: "Acknowledgement must refer to a selected place",
    });
  }
});

export type PlanDraft = z.infer<typeof planDraftSchema>;
export type PlanDraftSelectedPlace = z.infer<typeof planDraftSelectedPlaceSchema>;

type SelectionSnapshotInput = {
  regionId: RegionId;
  districtId?: string | null;
  places: readonly {
    id: string;
    regionId: RegionId;
    providerPlaceId: string;
    name: string;
    layer: "tourism" | "kakao" | "veterinary" | "pet_shop";
    category: (typeof PUBLIC_MAP_PLACE_CATEGORIES)[number];
    sourceLabel: PlanDraftSelectedPlace["sourceLabel"];
    publicLabel: string;
    petAccessVerdict: (typeof PUBLIC_MAP_PET_ACCESS_VERDICTS)[number];
    imageUrl?: string | null;
  }[];
  autoFill: boolean;
  includeVerificationRequired?: boolean;
  acknowledgedVerificationRequiredPlaceIds: readonly string[];
};

const PREFERENCE_CATEGORY_MAP = {
  ATTRACTION: "attraction",
  RESTAURANT: "food",
  CAFE: "food",
  ACCOMMODATION: "accommodation",
  WALK: "leisure",
} as const;

const SELECTED_CATEGORY_MAP: Partial<Record<
  SelectionSnapshotInput["places"][number]["category"],
  PlanDraft["requestedCategories"][number]
>> = {
  cafe: "food",
  food: "food",
  accommodation: "accommodation",
  attraction: "attraction",
  park_walk: "leisure",
  leisure: "leisure",
  camping: "leisure",
  shopping: "shopping",
};

function deriveEndTime(preferences: TravelPreferences): string | null {
  if (
    preferences.planningMode !== "duration" ||
    !preferences.desiredDurationMinutes ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(preferences.startTime)
  ) {
    return null;
  }
  const [hours, minutes] = preferences.startTime.split(":").map(Number);
  if (hours === undefined || minutes === undefined) return null;
  const endMinutes = hours * 60 + minutes + preferences.desiredDurationMinutes;
  if (endMinutes > 24 * 60) return null;
  const normalizedEndMinutes = endMinutes % (24 * 60);
  return `${String(Math.floor(normalizedEndMinutes / 60)).padStart(2, "0")}:${String(normalizedEndMinutes % 60).padStart(2, "0")}`;
}

export function createPlanDraft(regionId: RegionId): PlanDraft {
  const capabilities = getRegionConfig(regionId).routeCapabilities;
  return {
    schemaVersion: PLAN_DRAFT_SCHEMA_VERSION,
    regionId,
    districtId: null,
    selectedPlaces: [],
    acknowledgedVerificationRequiredPlaceIds: [],
    petProfile: null,
    origin: null,
    travelDate: null,
    startTime: null,
    endTime: null,
    requestedStopCount: 3,
    pace: "balanced",
    requestedCategories: [],
    autoFill: capabilities.automaticFill,
    includeVerificationRequired: false,
    tripType: "day_trip",
    roundTrip: false,
  };
}

export function updatePlanDraftSelection(
  draft: PlanDraft,
  selection: SelectionSnapshotInput,
): PlanDraft {
  const capabilities = getRegionConfig(selection.regionId).routeCapabilities;
  const selectedCategories = [...new Set(selection.places.flatMap(({ category }) => {
    const mapped = SELECTED_CATEGORY_MAP[category];
    return mapped ? [mapped] : [];
  }))];
  return {
    ...draft,
    regionId: selection.regionId,
    districtId: selection.districtId ?? (draft.regionId === selection.regionId ? draft.districtId : null),
    selectedPlaces: selection.places.map((place) => ({
      id: place.id,
      regionId: place.regionId,
      providerPlaceId: place.providerPlaceId,
      provider: place.id.startsWith("tour:") ? "kto" : "kakao",
      name: place.name,
      layer: place.layer,
      category: place.category,
      sourceLabel: place.sourceLabel,
      evidence: {
        verdict: place.petAccessVerdict,
        label: place.publicLabel,
      },
      locked: true,
    })),
    acknowledgedVerificationRequiredPlaceIds: [
      ...selection.acknowledgedVerificationRequiredPlaceIds,
    ],
    requestedCategories: selectedCategories.length > 0
      ? selectedCategories
      : draft.requestedCategories,
    autoFill: capabilities.automaticFill && selection.autoFill,
    includeVerificationRequired: selection.includeVerificationRequired ?? draft.includeVerificationRequired,
  };
}

export function updatePlanDraftScope(
  draft: PlanDraft,
  regionId: RegionId,
  districtId: string | null,
): PlanDraft {
  if (
    draft.selectedPlaces.length > 0 &&
    draft.selectedPlaces.some((place) => place.regionId !== regionId)
  ) {
    return draft;
  }
  const region = getRegionConfig(regionId);
  return {
    ...draft,
    regionId,
    districtId,
    autoFill: region.routeCapabilities.automaticFill && draft.autoFill,
  };
}

export function updatePlanDraftFromPlanner(
  draft: PlanDraft,
  input: { petProfile: PetProfile; preferences: TravelPreferences },
): PlanDraft {
  const region = getRegionConfigByService2LegalDongCode(input.preferences.regionCode);
  if (!region) throw new TypeError("Planner preferences use an unsupported region.");
  const requestedCategories: PlanDraft["requestedCategories"] = input.preferences.preferredCategories.map(
    (category) => PREFERENCE_CATEGORY_MAP[category],
  );
  if (input.preferences.includeShopping) requestedCategories.push("shopping");
  const uniqueRequestedCategories = [...new Set(requestedCategories)];
  return {
    ...draft,
    regionId: region.id,
    districtId: input.preferences.districtCode ?? null,
    petProfile: { ...input.petProfile },
    origin: input.preferences.departure ? {
      name: input.preferences.departure.label,
      source: input.preferences.departure.source ?? "kakao_place_search",
      latitude: input.preferences.departure.coordinates.latitude,
      longitude: input.preferences.departure.coordinates.longitude,
    } : null,
    travelDate: input.preferences.tripDate || null,
    startTime: input.preferences.startTime || null,
    endTime: deriveEndTime(input.preferences),
    requestedStopCount: input.preferences.desiredStopCount ?? draft.requestedStopCount,
    pace: input.preferences.tripPace,
    requestedCategories: uniqueRequestedCategories.length > 0
      ? uniqueRequestedCategories
      : draft.requestedCategories,
    autoFill: region.routeCapabilities.automaticFill && draft.autoFill,
    tripType: input.preferences.tripType === "OVERNIGHT" ? "overnight" : "day_trip",
    roundTrip: input.preferences.roundTrip ?? false,
  };
}

export function plannerInputFromPlanDraft(
  draft: PlanDraft,
): { petProfile: PetProfile; preferences: TravelPreferences } | null {
  if (
    !draft.petProfile ||
    !draft.origin ||
    !draft.travelDate ||
    !draft.startTime ||
    draft.requestedCategories.length === 0
  ) {
    return null;
  }
  const region = getRegionConfig(draft.regionId);
  const preferredCategoryMap: Partial<Record<PlanDraft["requestedCategories"][number], PlaceCategory>> = {
    attraction: "ATTRACTION",
    food: "RESTAURANT",
    leisure: "WALK",
    accommodation: "ACCOMMODATION",
  };
  const preferredCategories = [...new Set(draft.requestedCategories.flatMap((category) => {
    const mapped = preferredCategoryMap[category];
    return mapped ? [mapped] : [];
  }))];
  if (preferredCategories.length === 0 && !draft.requestedCategories.includes("shopping")) {
    return null;
  }
  return {
    petProfile: { ...draft.petProfile },
    preferences: {
      regionCode: region.providerCodes.korPetTourService2.legalDongRegionCode,
      regionName: region.displayName,
      districtCode: draft.districtId ?? undefined,
      districtName: draft.districtId
        ? getRegionConfig(draft.regionId).districts.find(
            ({ legalDongDistrictCode }) => legalDongDistrictCode === draft.districtId,
          )?.name
        : undefined,
      tripDate: draft.travelDate,
      tripType: draft.tripType === "overnight" ? "OVERNIGHT" : "DAY_TRIP",
      tripPace: draft.pace,
      startTime: draft.startTime,
      preferredCategories,
      departure: {
        label: draft.origin.name,
        source: draft.origin.source,
        coordinates: {
          latitude: draft.origin.latitude,
          longitude: draft.origin.longitude,
        },
      },
      planningMode: "stop_count",
      desiredStopCount: draft.requestedStopCount,
      includeShopping: draft.requestedCategories.includes("shopping"),
      roundTrip: draft.roundTrip,
      environmentPreference: "any",
    },
  };
}

export function loadPlanDraft(storage?: StorageLike | null): PlanDraft | null {
  return readVersionedValue(PLAN_DRAFT_STORAGE_KEY, planDraftSchema, {
    version: PLAN_DRAFT_SCHEMA_VERSION,
    storage,
  });
}

export function savePlanDraft(
  draft: PlanDraft,
  storage?: StorageLike | null,
): boolean {
  return writeVersionedValue(PLAN_DRAFT_STORAGE_KEY, draft, planDraftSchema, {
    version: PLAN_DRAFT_SCHEMA_VERSION,
    storage,
  });
}
