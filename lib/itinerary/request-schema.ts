import { z } from "zod";
import {
  BUSAN_DISTRICTS,
  BUSAN_REGION,
  getBusanDistrictName,
  type BusanDistrictCode,
  type TourCatalogCategory,
} from "@/lib/tour-api/catalog";
import { coordinatesSchema, petSizeSchema } from "@/lib/shared/domain-schemas";
import type { NormalizedItineraryRequest } from "@/types/route-generation";

export const ROUTE_TRAVEL_CATEGORIES = [
  "attraction",
  "culture",
  "festival",
  "leisure",
  "accommodation",
  "food",
  "shopping",
] as const satisfies readonly TourCatalogCategory[];

const districtCodes = BUSAN_DISTRICTS.map(({ code }) => code) as [
  BusanDistrictCode,
  ...BusanDistrictCode[],
];

const sameDayTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

const petEquipmentSchema = z
  .object({
    hasCarrier: z.boolean().optional(),
    hasLeash: z.boolean().optional(),
    hasMuzzle: z.boolean().optional(),
  })
  .strict();

const routeSignatureSchema = z.string().trim().min(1).max(600);

const scopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("busan") }).strict(),
  z
    .object({
      type: z.literal("district"),
      districtCode: z.enum(districtCodes),
    })
    .strict(),
]);

const planningSchema = z.union([
  z
    .object({
      desiredDurationMinutes: z.number().int().min(120).max(600),
      desiredStopCount: z.never().optional(),
    })
    .strict(),
  z
    .object({
      desiredStopCount: z.number().int().min(1).max(5),
      desiredDurationMinutes: z.never().optional(),
    })
    .strict(),
]);

export const itineraryGenerationRequestSchema = z
  .object({
    scope: scopeSchema,
    start: z
      .object({
        coordinates: coordinatesSchema,
        label: z.string().trim().min(1).max(80).optional(),
      })
      .strict(),
    travelDate: z.string().date(),
    startTime: sameDayTimeSchema,
    planning: planningSchema,
    petSize: petSizeSchema.optional(),
    petEquipment: petEquipmentSchema.optional(),
    indoorAccessPreference: z
      .enum(["any", "preferred", "required"])
      .default("any"),
    selectedCategories: z
      .array(z.enum(ROUTE_TRAVEL_CATEGORIES))
      .min(1)
      .max(ROUTE_TRAVEL_CATEGORIES.length)
      .refine((values) => new Set(values).size === values.length, {
        message: "selectedCategories must not contain duplicates",
      }),
    includeShopping: z.boolean().default(false),
    generationSeed: z.string().trim().min(1).max(96).default("default"),
    recentRouteSignatures: z
      .array(routeSignatureSchema)
      .max(12)
      .refine((values) => new Set(values).size === values.length, {
        message: "recentRouteSignatures must not contain duplicates",
      })
      .default([]),
  })
  .strict()
  .superRefine((request, context) => {
    if (typeof request.planning.desiredDurationMinutes !== "number") return;
    const [hours, minutes] = request.startTime.split(":").map(Number);
    const startMinutes = hours * 60 + minutes;
    if (startMinutes + request.planning.desiredDurationMinutes > 24 * 60) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["planning", "desiredDurationMinutes"],
        message: "The requested same-day duration exceeds midnight",
      });
    }
  });

export type ItineraryGenerationRequest = z.input<
  typeof itineraryGenerationRequestSchema
>;

export function normalizeItineraryRequest(
  input: z.output<typeof itineraryGenerationRequestSchema>,
): NormalizedItineraryRequest {
  const duration =
    typeof input.planning.desiredDurationMinutes === "number"
      ? input.planning.desiredDurationMinutes
      : null;
  const desiredStopCount =
    typeof input.planning.desiredStopCount === "number"
      ? input.planning.desiredStopCount
      : Math.max(1, Math.min(5, Math.floor((duration ?? 120) / 90)));
  const scope: NormalizedItineraryRequest["scope"] =
    input.scope.type === "busan"
      ? {
          type: "busan",
          regionCode: BUSAN_REGION.code,
          regionName: "부산 전체",
        }
      : {
          type: "district",
          regionCode: BUSAN_REGION.code,
          regionName: "부산",
          districtCode: input.scope.districtCode,
          districtName:
            getBusanDistrictName(input.scope.districtCode) ?? input.scope.districtCode,
        };

  return {
    scope,
    start: {
      coordinates: input.start.coordinates,
      label: input.start.label ?? null,
    },
    travelDate: input.travelDate,
    startTime: input.startTime,
    planningMode: duration === null ? "stop_count" : "duration",
    desiredDurationMinutes: duration,
    desiredStopCount,
    petSize: input.petSize ?? null,
    petEquipment: {
      hasCarrier: input.petEquipment?.hasCarrier ?? null,
      hasLeash: input.petEquipment?.hasLeash ?? null,
      hasMuzzle: input.petEquipment?.hasMuzzle ?? null,
    },
    indoorAccessPreference: input.indoorAccessPreference,
    selectedCategories: input.selectedCategories,
    includeShopping: input.includeShopping,
    generationSeed: input.generationSeed,
    recentRouteSignatures: input.recentRouteSignatures,
  };
}

export function getItineraryGenerationRequestKey(
  request: NormalizedItineraryRequest,
): string {
  return JSON.stringify({
    version: "2",
    scope: request.scope,
    start: request.start,
    travelDate: request.travelDate,
    startTime: request.startTime,
    planningMode: request.planningMode,
    desiredDurationMinutes: request.desiredDurationMinutes,
    desiredStopCount: request.desiredStopCount,
    petSize: request.petSize,
    petEquipment: request.petEquipment,
    indoorAccessPreference: request.indoorAccessPreference,
    selectedCategories: [...request.selectedCategories].sort(),
    includeShopping: request.includeShopping,
    generationSeed: request.generationSeed,
    recentRouteSignatures: [...request.recentRouteSignatures].sort(),
  });
}
