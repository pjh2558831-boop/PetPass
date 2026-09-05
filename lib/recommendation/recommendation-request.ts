import { z } from "zod";
import {
  REGION_IDS,
  coordinatesInItineraryOriginScope,
  getRegionConfig,
  getRegionDistrict,
  getRegionRouteCapabilityBlock,
  type RegionConfig,
} from "@/lib/regions/config";
import { getTripPaceConfig } from "@/lib/itinerary/trip-pace";
import type { NormalizedItineraryRequest } from "@/types/route-generation";
import type { RouteRecommendationRequest } from "@/types/recommendation";

const coordinates = z.number().finite();
const categories = z.enum([
  "attraction",
  "culture",
  "festival",
  "leisure",
  "accommodation",
  "food",
  "shopping",
]);
const recommendationRegionProbeSchema = z.object({
  trip: z.object({ regionId: z.string() }),
});
const personalizationSchema = z.object({
  petCount: z.number().int().min(1).max(4).default(1),
  petActivityLevel: z.enum(["low", "moderate", "high"]).default("moderate"),
  walkingTolerance: z.enum(["low", "moderate", "high"]).default("moderate"),
  crowdPreference: z.enum(["avoid", "any", "enjoy"]).default("any"),
  tripMood: z.enum(["balanced", "scenic", "foodie", "active", "restful"]).default("balanced"),
  categoryPriorities: z.record(categories, z.number().finite().min(0).max(1)).default({}),
  recentRouteSignatures: z.array(z.string().trim().min(1).max(512)).max(12).default([]),
  recentlySelectedCandidateIds: z.array(z.string().trim().min(1).max(128)).max(30).default([]),
  historyContextKey: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  explicitlyExcludedPlaceIds: z.array(z.string().trim().min(1).max(128)).max(30).default([]),
  rerollVariant: z.number().int().min(0).max(10_000).default(0),
}).strict();
const canonicalPlaceId = z.string().trim().max(128).regex(
  /^(?:tour|kakao):[0-9]+$/u,
  "selectedPlaceIds must use a canonical provider identity.",
);
const selectedPlaceReference = z.object({
  placeId: canonicalPlaceId,
  regionId: z.enum(REGION_IDS),
}).strict();

export function getRequestedRecommendationRegion(
  input: unknown,
): RegionConfig | null {
  const parsed = recommendationRegionProbeSchema.safeParse(input);
  return parsed.success ? getRegionConfig(parsed.data.trip.regionId) : null;
}
export const routeRecommendationRequestSchema = z
  .object({
    requestVersion: z.literal(2).optional(),
    planningPolicy: z.literal("full_public_catalog_v1").optional(),
    conditionConfirmation: z.object({ token: z.string().min(1).max(24_000), answers: z.array(z.object({ requirementId: z.string().regex(/^[a-f0-9]{64}$/), answer: z.enum(["confirmed", "not_applicable", "cannot_meet"]) }).strict()).max(100).refine((answers) => new Set(answers.map(({ requirementId }) => requirementId)).size === answers.length) }).strict().optional(),
    departure: z
      .object({
        label: z.string().trim().min(1).max(150),
        latitude: coordinates.min(-90).max(90),
        longitude: coordinates.min(-180).max(180),
        source: z.enum([
          "kakao_place_search",
          "address_search",
          "map_selection",
          "current_location",
        ]),
      })
      .strict(),
    trip: z
      .object({
        regionId: z.enum(REGION_IDS),
        districtId: z.string().trim().min(1).max(20).nullable(),
        date: z.string().date().nullable().default(null),
        startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u).nullable().default(null),
        tripType: z.enum(["day_trip", "overnight"]),
        tripPace: z.enum(["relaxed", "balanced", "packed"]),
        selectedCategories: z
          .array(categories)
          .max(7)
          .refine((values) => new Set(values).size === values.length, {
            message: "selectedCategories must not contain duplicates",
          }),
        roundTrip: z.boolean(),
        environmentPreference: z
          .enum(["any", "indoor_preferred", "outdoor_preferred"])
          .default("any"),
        desiredStopCount: z.number().int().min(1).max(5).optional(),
        durationMinutes: z.number().int().min(60).max(720).optional(),
        travelMode: z.literal("driving").default("driving"),
      })
      .strict()
      .superRefine((trip, context) => {
        const region = getRegionConfig(trip.regionId);
        if (
          trip.districtId !== null &&
          (!region || !getRegionDistrict(region, trip.districtId))
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["districtId"],
            message: "districtId must belong to regionId.",
          });
        }
      }),
    pet: z
      .object({
        name: z.string().trim().max(30).nullable(),
        species: z.enum(["DOG", "CAT", "OTHER"]),
        size: z.enum(["SMALL", "MEDIUM", "LARGE"]),
        availableEquipment: z
          .object({
            carrier: z.boolean(),
            leash: z.boolean(),
            muzzle: z.boolean(),
          })
          .strict().optional(),
        acceptsOutdoorOnlyPlaces: z.boolean().optional(),
      })
      .strict(),
    selectedPlaceIds: z
      .array(canonicalPlaceId)
      .max(5)
      .refine((values) => new Set(values).size === values.length, {
        message: "selectedPlaceIds must not contain duplicates",
      })
      .default([]),
    autoFill: z.boolean().default(true),
    selectedPlaceReferences: z.array(selectedPlaceReference).max(5).default([]),
    acknowledgedVerificationRequiredPlaceIds: z.array(canonicalPlaceId).max(5).default([]),
    includeVerificationRequired: z.boolean().default(false),
    personalization: personalizationSchema.default({}),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.trip.selectedCategories.length === 0 && value.selectedPlaceIds.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trip", "selectedCategories"],
        message: "Select a category or a place.",
      });
    }
    if (value.requestVersion !== 2 && (!value.trip.date || !value.trip.startTime || !value.pet.availableEquipment || value.pet.acceptsOutdoorOnlyPlaces === undefined)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["requestVersion"], message: "Flexible inputs require requestVersion 2." });
    }
    const region = getRegionConfig(value.trip.regionId);
    if (
      region &&
      !coordinatesInItineraryOriginScope(region, {
        latitude: value.departure.latitude,
        longitude: value.departure.longitude,
      })
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["departure"],
        message: "DEPARTURE_OUTSIDE_ITINERARY_REGION",
      });
    }
    const selectedIds = new Set(value.selectedPlaceIds);
    const referenceIds = value.selectedPlaceReferences.map(({ placeId }) => placeId);
    if (
      new Set(referenceIds).size !== referenceIds.length ||
      referenceIds.some((placeId) => !selectedIds.has(placeId)) ||
      (referenceIds.length > 0 && referenceIds.length !== selectedIds.size)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selectedPlaceReferences"],
        message: "selectedPlaceReferences must correspond exactly to selectedPlaceIds.",
      });
    }
    if (
      !value.includeVerificationRequired &&
      value.acknowledgedVerificationRequiredPlaceIds.some((placeId) => !selectedIds.has(placeId))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["acknowledgedVerificationRequiredPlaceIds"],
        message: "Automatic-place acknowledgements require includeVerificationRequired.",
      });
    }
  });

export function normalizeRecommendationRequest(
  input: RouteRecommendationRequest,
): NormalizedItineraryRequest {
  const requestedRegion = getRegionConfig(input.trip.regionId);
  if (getRegionRouteCapabilityBlock(requestedRegion, {
    selectedPlaceCount: input.selectedPlaceIds?.length ?? 0,
    autoFill: input.autoFill ?? true,
  })) {
    throw new TypeError("REGION_NOT_SUPPORTED_FOR_ITINERARY");
  }
  if (!coordinatesInItineraryOriginScope(requestedRegion, {
    latitude: input.departure.latitude,
    longitude: input.departure.longitude,
  })) {
    throw new TypeError("DEPARTURE_OUTSIDE_ITINERARY_REGION");
  }
  const pace = getTripPaceConfig(input.trip.tripPace);
  const district = getRegionDistrict(
    requestedRegion,
    input.trip.districtId,
  );
  return {
    scope: district
      ? {
          type: "district",
          regionCode:
            requestedRegion.providerCodes.korPetTourService2
              .legalDongRegionCode,
          regionName: requestedRegion.displayName,
          districtCode: district.legalDongDistrictCode,
          districtName: district.name,
        }
      : {
          type: "region",
          regionCode:
            requestedRegion.providerCodes.korPetTourService2
              .legalDongRegionCode,
          regionName: `${requestedRegion.displayName} 전체`,
        },
    start: {
      label: input.departure.label,
      coordinates: {
        latitude: input.departure.latitude,
        longitude: input.departure.longitude,
      },
    },
    travelDate: input.trip.date ?? "2000-01-01",
    ...(input.requestVersion === 2 ? { scheduleIntent: { date: input.trip.date, startTime: input.trip.startTime } } : {}),
    tripType: input.trip.tripType === "overnight" ? "OVERNIGHT" : "DAY_TRIP",
    tripPace: input.trip.tripPace,
    startTime: input.trip.startTime ?? "09:00",
    planningMode: "stop_count",
    desiredDurationMinutes: input.trip.durationMinutes ?? null,
    desiredStopCount: input.trip.desiredStopCount ?? pace.desiredStopCount,
    petSpecies: input.pet.species,
    petSize: input.pet.size,
    acceptsOutdoorOnly: input.pet.acceptsOutdoorOnlyPlaces ?? null,
    petEquipment: {
      hasCarrier: input.pet.availableEquipment?.carrier ?? null,
      hasLeash: input.pet.availableEquipment?.leash ?? null,
      hasMuzzle: input.pet.availableEquipment?.muzzle ?? null,
    },
    indoorAccessPreference: "any",
    environmentPreference: input.trip.environmentPreference ?? "any",
    selectedCategories: input.trip.selectedCategories,
    includeShopping: input.trip.selectedCategories.includes("shopping"),
    generationSeed: `route-engine-v2:${input.personalization?.rerollVariant ?? 0}`,
    recentRouteSignatures: input.personalization?.recentRouteSignatures ?? [],
    personalization: input.personalization ?? {
      petCount: 1,
      petActivityLevel: "moderate",
      walkingTolerance: "moderate",
      crowdPreference: "any",
      tripMood: "balanced",
      categoryPriorities: {},
      recentRouteSignatures: [],
      recentlySelectedCandidateIds: [],
      explicitlyExcludedPlaceIds: [],
      rerollVariant: 0,
    },
  };
}

export type ParsedRouteRecommendationRequest = z.output<
  typeof routeRecommendationRequestSchema
>;
