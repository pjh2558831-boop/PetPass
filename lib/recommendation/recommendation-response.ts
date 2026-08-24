import { z } from "zod";
import type {
  ManualRouteValidationResponseV1,
  RouteRecommendationResponseV1,
} from "@/types/recommendation";
import type { TourPetAccessConditionType } from "@/types/tour-pet-access";

const coordinates = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict();
const nonNegative = z.number().finite().nonnegative();
const nonEmpty = z.string().min(1);
const category = z.enum([
  "attraction",
  "culture",
  "festival",
  "leisure",
  "accommodation",
  "food",
  "shopping",
]);
const failureStatus = z.enum([
  "invalid_request",
  "region_not_supported_for_itinerary",
  "insufficient_eligible_places",
  "insufficient_feasible_route",
  "tourism_provider_unavailable",
  "licensing_provider_unavailable",
  "travel_matrix_incomplete",
  "kakao_provider_unavailable",
  "final_route_validation_failed",
  "rate_limited",
  "route_engine_disabled",
  "internal_error",
]);
const failure = z.object({
  status: failureStatus,
  apiVersion: z.literal("route-recommendation-response-v1"),
  reasonCodes: z.array(nonEmpty),
  userMessage: nonEmpty,
  retryable: z.boolean(),
}).strict();
const stop = z.object({
  placeId: nonEmpty,
  sequence: z.number().int().min(1).max(5),
  title: nonEmpty,
  address: z.string().nullable(),
  coordinates,
  category,
  arrivalAt: z.string().datetime(),
  visitStartsAt: z.string().datetime(),
  departureAt: z.string().datetime(),
  dwellMinutes: z.number().int().positive(),
  driveSecondsFromPrevious: nonNegative,
  distanceMetersFromPrevious: nonNegative,
  source: z.literal("tourism_service2"),
  sourceLabel: z.literal("한국관광공사"),
  petAssessment: z.enum(["allowed", "conditional"]),
  mandatoryConditions: z.array(
    z.object({
      type: z.custom<TourPetAccessConditionType>(
        (value) => typeof value === "string" && value.length > 0,
      ),
      label: nonEmpty,
      manualConfirmationRecommended: z.boolean(),
    }).strict(),
  ),
  informationTrust: z.enum(["high", "medium", "low"]),
  licensingStatus: z.enum([
    "confirmed_open",
    "no_match",
    "verification_required",
    "not_applicable",
  ]),
  operatingHoursWarnings: z.array(nonEmpty),
  inclusionReasonCodes: z.array(nonEmpty),
  orderingReasonCodes: z.array(nonEmpty),
  warningCodes: z.array(nonEmpty),
  evidence: z.array(
    z.object({ field: nonEmpty, label: nonEmpty, originalText: nonEmpty }).strict(),
  ),
}).strict();
const summary = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  stopCount: z.number().int().min(1).max(5),
  totalDistanceMeters: nonNegative,
  totalDrivingSeconds: nonNegative,
  totalVisitSeconds: nonNegative,
  totalWaitSeconds: nonNegative,
}).strict();
const route = z.object({
  id: nonEmpty,
  kind: z.enum(["optimized", "manual"]),
  label: nonEmpty,
  routeSummary: summary,
  temporalBasis: z.object({
    searchMatrix: nonEmpty,
    finalRoute: nonEmpty,
  }).strict(),
  stops: z.array(stop).min(1).max(5),
  geometry: z.array(coordinates).min(2),
}).strict();
const alternative = route.extend({
  kind: z.literal("optimized"),
  alternativeType: z.enum(["lower_travel", "popularity_oriented"]),
});
const ready = z.object({
  status: z.literal("ready"),
  apiVersion: z.literal("route-recommendation-response-v1"),
  engineVersion: z.literal("petpass-route-engine-v1"),
  objectiveVersion: z.literal("route-objective-v1"),
  solverVersion: z.literal("route-solver-v1"),
  editSessionId: nonEmpty,
  requestSummary: z.object({
    departureLabel: nonEmpty,
    tripDate: z.string().date(),
    startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u),
    tripType: z.enum(["day_trip", "overnight"]),
    tripPace: z.enum(["relaxed", "balanced", "packed"]),
    selectedCategories: z.array(category).min(1),
    roundTrip: z.boolean(),
  }).strict(),
  optimality: z.enum([
    "optimal_within_candidate_set_current_matrix",
    "best_found_within_time_limit",
  ]),
  route: route.extend({ kind: z.literal("optimized") }),
  alternatives: z.array(alternative).max(2),
  excludedHighlights: z.array(
    z.object({ placeId: nonEmpty, title: z.string().nullable(), reasonCode: nonEmpty }).strict(),
  ),
  warnings: z.array(nonEmpty),
  diagnostics: z
    .object({
      candidatePipeline: z.object({
        stageA: z.number().int().nonnegative(),
        stageB: z.number().int().nonnegative(),
        detailedEvaluations: z.number().int().nonnegative(),
        eligible: z.number().int().nonnegative(),
      }).strict(),
      travelMatrix: z.object({
        nodes: z.number().int().nonnegative(),
        resolvedEdges: z.number().int().nonnegative(),
        unresolvedEdges: z.number().int().nonnegative(),
      }).strict(),
      solver: z.object({
        durationMs: nonNegative,
        validationAttempts: z.number().int().nonnegative(),
        validationFailures: z.number().int().nonnegative(),
      }).strict(),
    })
    .strict()
    .optional(),
}).strict();

export const routeRecommendationReadyResponseSchema = ready;

export const routeRecommendationResponseSchema: z.ZodType<RouteRecommendationResponseV1> =
  z.discriminatedUnion("status", [ready, failure]);

export const manualRouteValidationRequestSchema = z
  .object({
    editSessionId: z
      .string()
      .min(40)
      .max(256_000)
      .regex(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u),
    orderedPlaceIds: z
      .array(z.string().trim().min(1).max(100))
      .min(1)
      .max(5)
      .refine((values) => new Set(values).size === values.length, {
        message: "orderedPlaceIds must not contain duplicates",
      }),
  })
  .strict();

export const manualRouteValidationResponseSchema: z.ZodType<ManualRouteValidationResponseV1> =
  z.union([
    z.object({
      status: z.literal("ready"),
      apiVersion: z.literal("route-recommendation-response-v1"),
      route: route.extend({ kind: z.literal("manual") }),
      warnings: z.array(nonEmpty),
    }),
    failure,
  ]);
