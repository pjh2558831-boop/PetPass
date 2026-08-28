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
  "unavailable",
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
  source: z.enum(["tourism_service2", "kakao_catalog"]),
  sourceLabel: z.enum(["한국관광공사", "카카오 검색 후보"]),
  petAssessment: z.enum(["allowed", "conditional", "unknown"]),
  evidenceStatus: z.enum(["verified", "conditional", "unverified"]).optional(),
  retrievedAt: z.string().datetime({ offset: true }).nullable().optional(),
  providerIdentities: z.array(z.object({
    provider: z.enum(["kto", "kakao"]),
    id: nonEmpty,
  }).strict()).optional(),
  provenance: z.enum(["user_selected", "auto_fill"]).optional(),
  locked: z.boolean().optional(),
  verificationWarning: nonEmpty.nullable().optional(),
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
  style: z.enum(["comfort", "preference", "efficient"]).optional(),
  routeSignature: nonEmpty.optional(),
  requestedTarget: z.number().int().min(1).max(5).optional(),
  reductionStatus: z.enum(["complete", "reduced", "single_stop"]).optional(),
  personalizationExplanationCodes: z.array(nonEmpty).optional(),
}).strict();
const alternative = route.extend({
  kind: z.literal("optimized"),
  alternativeType: z.enum(["lower_travel", "popularity_oriented"]),
});
const selectionIssue = z.object({
  placeId: nonEmpty,
  code: z.enum([
    "selected_place_not_found_in_region",
    "selected_place_cross_region",
    "selected_place_missing_coordinates",
    "selected_place_not_allowed",
    "selected_place_condition_unsatisfied",
    "selected_place_trip_incompatible",
    "selected_place_explicitly_excluded",
    "selected_anchor_large_detour",
  ]),
  blocking: z.boolean(),
  reasonCodes: z.array(nonEmpty),
  replacementCandidateIds: z.array(nonEmpty).max(3),
}).strict();
const replacementCandidate = z.object({
  placeId: nonEmpty,
  title: nonEmpty,
  category,
  source: z.enum(["tourism_service2", "kakao_catalog"]),
}).strict();
const failureWithSelection = failure.extend({
  selectionMode: z.literal("hybrid").optional(),
  selectionIssues: z.array(selectionIssue).optional(),
  replacementCandidates: z.array(replacementCandidate).max(3).optional(),
});
const ready = z.object({
  status: z.literal("ready"),
  apiVersion: z.literal("route-recommendation-response-v1"),
  engineVersion: z.enum(["petpass-route-engine-v1", "petpass-route-engine-v2"]),
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
  contractVersion: z.literal("route-recommendation-v2").optional(),
  region: z.enum(["busan", "jeju"]).optional(),
  requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  resultState: z.enum(["ready", "ready_with_reduced_stops", "single_stop_suggestion"]).optional(),
  routeOptions: z.array(route.extend({ kind: z.literal("optimized") })).min(1).max(3).optional(),
  candidateSourceCounts: z.object({
    kto: z.number().int().nonnegative(),
    kakao: z.number().int().nonnegative(),
    merged: z.number().int().nonnegative(),
  }).strict().optional(),
  alternativeAvailability: z.enum(["available", "limited"]).optional(),
  selectionMode: z.enum(["automatic", "hybrid"]).optional(),
  selectionIssues: z.array(selectionIssue).optional(),
  replacementCandidates: z.array(replacementCandidate).max(3).optional(),
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
  z.discriminatedUnion("status", [ready, failureWithSelection]);

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
