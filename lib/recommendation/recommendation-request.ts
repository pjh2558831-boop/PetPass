import "server-only";

import { z } from "zod";
import {
  BUSAN_REGION_CONFIG,
  getRegionDistrict,
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
const districtIds = BUSAN_REGION_CONFIG.districts.map(({ code }) => code) as [
  string,
  ...string[],
];

export const routeRecommendationRequestSchema = z
  .object({
    departure: z
      .object({
        label: z.string().trim().min(1).max(150),
        latitude: coordinates.min(-90).max(90),
        longitude: coordinates.min(-180).max(180),
        source: z.enum([
          "kakao_place_search",
          "address_search",
          "map_selection",
        ]),
      })
      .strict(),
    trip: z
      .object({
        regionId: z.literal(BUSAN_REGION_CONFIG.id),
        districtId: z.enum(districtIds).nullable(),
        date: z.string().date(),
        startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u),
        tripType: z.enum(["day_trip", "overnight"]),
        tripPace: z.enum(["relaxed", "balanced", "packed"]),
        selectedCategories: z
          .array(categories)
          .min(1)
          .max(7)
          .refine((values) => new Set(values).size === values.length, {
            message: "selectedCategories must not contain duplicates",
          }),
        roundTrip: z.boolean(),
      })
      .strict()
      .superRefine((trip, context) => {
        if (trip.tripType === "overnight" && !trip.selectedCategories.includes("accommodation")) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["selectedCategories"],
            message: "Overnight requests must include accommodation.",
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
          .strict(),
        acceptsOutdoorOnlyPlaces: z.boolean(),
      })
      .strict(),
  })
  .strict();

export function normalizeRecommendationRequest(
  input: RouteRecommendationRequest,
): NormalizedItineraryRequest {
  const pace = getTripPaceConfig(input.trip.tripPace);
  const district = getRegionDistrict(
    BUSAN_REGION_CONFIG,
    input.trip.districtId,
  );
  return {
    scope: district
      ? {
          type: "district",
          regionCode: "26",
          regionName: BUSAN_REGION_CONFIG.displayName,
          districtCode: district.code,
          districtName: district.name,
        }
      : {
          type: "busan",
          regionCode: "26",
          regionName: "부산 전체",
        },
    start: {
      label: input.departure.label,
      coordinates: {
        latitude: input.departure.latitude,
        longitude: input.departure.longitude,
      },
    },
    travelDate: input.trip.date,
    tripType: input.trip.tripType === "overnight" ? "OVERNIGHT" : "DAY_TRIP",
    tripPace: input.trip.tripPace,
    startTime: input.trip.startTime,
    planningMode: "stop_count",
    desiredDurationMinutes: null,
    desiredStopCount: pace.desiredStopCount,
    petSpecies: input.pet.species,
    petSize: input.pet.size,
    acceptsOutdoorOnly: input.pet.acceptsOutdoorOnlyPlaces,
    petEquipment: {
      hasCarrier: input.pet.availableEquipment.carrier,
      hasLeash: input.pet.availableEquipment.leash,
      hasMuzzle: input.pet.availableEquipment.muzzle,
    },
    indoorAccessPreference: input.pet.acceptsOutdoorOnlyPlaces
      ? "any"
      : "required",
    selectedCategories: input.trip.selectedCategories,
    includeShopping: input.trip.selectedCategories.includes("shopping"),
    generationSeed: "route-engine-v1",
    recentRouteSignatures: [],
  };
}

export type ParsedRouteRecommendationRequest = z.output<
  typeof routeRecommendationRequestSchema
>;
