import { z } from "zod";
import type {
  ManualRouteValidationResponseV1,
  RouteRecommendationResponseV1,
} from "@/types/recommendation";
import type {
  TourPetAccessConditionType,
  TourPetAccessScope,
} from "@/types/tour-pet-access";
import type {
  CanonicalPetConditionCode,
  CanonicalPetConditionItem,
  CanonicalPetConditionReasonCode,
  CanonicalPetConditionWarning,
} from "@/types/pet-condition-eligibility";
import { REGION_IDS } from "@/types/region";

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
  "transportation",
  "unknown",
]);
const petConditionItem = z.object({
  subject: z.enum(["all", "dangerous_dog", "unknown"]).optional(),
  code: z.custom<CanonicalPetConditionCode>(
    (value) => typeof value === "string" && value.length > 0,
  ),
  sourceType: z.custom<CanonicalPetConditionItem["sourceType"]>(
    (value) => typeof value === "string" && value.length > 0,
  ),
  label: nonEmpty,
  sourceText: nonEmpty,
  scope: z.custom<TourPetAccessScope>(
    (value) => typeof value === "string" && value.length > 0,
  ),
  evidenceIds: z.array(nonEmpty),
}).strict();
const petConditionWarning = z.object({
  code: z.custom<CanonicalPetConditionWarning["code"]>(
    (value) => typeof value === "string" && value.length > 0,
  ),
  message: nonEmpty,
  sourceText: z.string().nullable(),
  evidenceIds: z.array(nonEmpty),
}).strict();
const petConditionEligibility = z.object({
  version: z.enum(["canonical-pet-condition-v1", "canonical-pet-condition-v2"]),
  state: z.enum([
    "eligible",
    "eligible_with_confirmation",
    "ineligible",
    "insufficient_evidence",
  ]),
  conditionCodes: z.array(z.custom<CanonicalPetConditionCode>(
    (value) => typeof value === "string" && value.length > 0,
  )),
  satisfiedConditions: z.array(petConditionItem),
  guidanceConditions: z.array(petConditionItem).optional(),
  conflictingConditions: z.array(petConditionItem),
  confirmationRequiredConditions: z.array(petConditionItem),
  unsupportedConditions: z.array(petConditionItem),
  evidenceSources: z.array(z.object({
    operation: z.enum(["detailPetTour2", "detailIntro2"]),
    status: z.enum(["available", "empty", "unavailable"]),
    retrievedAt: z.string().datetime({ offset: true }),
    providerModifiedTime: z.string().nullable(),
  }).strict()),
  warnings: z.array(petConditionWarning),
  reasonCodes: z.array(z.custom<CanonicalPetConditionReasonCode>(
    (value) => typeof value === "string" && value.length > 0,
  )),
}).strict();
const confirmationRequirement = z.object({
  placeId: nonEmpty,
  title: nonEmpty,
  selectionOrigin: z.enum([
    "user_selected",
    "automatic_fill",
    "automatic_recommendation",
  ]),
  conditionEligibility: petConditionEligibility,
  questions: z.array(z.object({ requirementId: nonEmpty, placeId: nonEmpty, label: nonEmpty, sourceText: nonEmpty, answers: z.array(z.enum(["confirmed", "not_applicable", "cannot_meet"])) }).strict()).optional(),
}).strict();
const failureStatus = z.enum([
  "confirmation_required",
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
  apiVersion: z.enum(["route-recommendation-response-v1", "route-recommendation-response-v2"]),
  reasonCodes: z.array(nonEmpty),
  userMessage: nonEmpty,
  retryable: z.boolean(),
  confirmationRequirements: z.array(confirmationRequirement).max(5).optional(),
  confirmationToken: nonEmpty.optional(),
  resultState: z.enum(["insufficient_eligible_places", "insufficient_feasible_route", "confirmation_required"]).optional(),
  requestedStopCount: z.number().int().min(1).max(5).optional(),
  feasibleStopCount: z.number().int().min(0).max(5).optional(),
  resultExplanation: nonEmpty.optional(),
  recoveryActions: z.array(z.enum([
    "reduce_requested_stops",
    "change_time_window",
    "change_categories",
    "widen_district",
    "select_places_manually",
    "allow_verification_required_candidates",
    "acknowledge_selected_place_verification",
    "acknowledge_route_conditions",
  ])).optional(),
}).strict();
const stop = z.object({
  placeId: nonEmpty,
  sequence: z.number().int().min(1).max(5),
  title: nonEmpty,
  address: z.string().nullable(),
  coordinates,
  category,
  arrivalOffsetSeconds: nonNegative.optional(),
  visitStartsOffsetSeconds: nonNegative.optional(),
  departureOffsetSeconds: nonNegative.optional(),
  arrivalAt: z.string().datetime().nullable(),
  visitStartsAt: z.string().datetime().nullable(),
  departureAt: z.string().datetime().nullable(),
  dwellMinutes: z.number().int().positive(),
  driveSecondsFromPrevious: nonNegative,
  distanceMetersFromPrevious: nonNegative,
  source: z.enum(["tourism_service2", "kakao_catalog"]),
  sourceLabel: z.enum(["한국관광공사", "카카오 검색 후보"]),
  petAssessment: z.enum(["allowed", "conditional", "not_allowed", "unknown"]),
  evidenceStatus: z.enum(["verified", "conditional", "unverified"]).optional(),
  retrievedAt: z.string().datetime({ offset: true }).nullable().optional(),
  providerIdentities: z.array(z.object({
    provider: z.enum(["kto", "kakao"]),
    id: nonEmpty,
  }).strict()).optional(),
  catalogEvidence: z.array(z.object({
    provider: z.enum(["kto", "kakao"]),
    providerPlaceId: nonEmpty,
    petAssessment: z.enum(["allowed", "conditional", "not_allowed", "unknown"]),
    originalText: z.string().max(2_000).nullable(),
    retrievedAt: z.string().datetime({ offset: true }).nullable(),
    publicLabel: z.string().min(1).max(200),
  }).strict()).max(8).optional(),
  regionId: z.enum(REGION_IDS).optional(),
  districtId: z.string().nullable().optional(),
  selectionOrigin: z.enum(["user_selected", "automatic_fill", "automatic_recommendation"]).optional(),
  operatingHoursEvidenceState: z.enum(["verified", "verification_required"]).optional(),
  operatingStatus: z.enum(["unknown", "reported_closed", "reported_open"]).optional(),
  provenance: z.enum(["user_selected", "auto_fill"]).optional(),
  locked: z.boolean().optional(),
  verificationWarning: nonEmpty.nullable().optional(),
  petConditionEligibility: petConditionEligibility.optional(),
  conditionAcknowledged: z.boolean().optional(),
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
    "confirmed_closed",
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
  totalElapsedSeconds: nonNegative.optional(),
  startAt: z.string().datetime().nullable(),
  endAt: z.string().datetime().nullable(),
  stopCount: z.number().int().min(1).max(5),
  totalDistanceMeters: nonNegative,
  totalDrivingSeconds: nonNegative,
  totalVisitSeconds: nonNegative,
  totalWaitSeconds: nonNegative,
}).strict();
const scheduleIntent = z.object({ date: z.string().date().nullable(), startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable() }).strict();
const routeSchedule = z.object({ requested: scheduleIntent, effective: scheduleIntent, state: z.enum(["scheduled", "undated_template", "adjustment_proposal"]), timingBasis: z.enum(["relative", "illustrative_clock", "dated"]), roadValidated: z.boolean(), timeBudgetValidated: z.boolean(), calendarValidation: z.enum(["checked_known_rules", "date_required", "unchecked"]), operatingAvailability: z.enum(["known_rules_checked", "requires_confirmation", "unchecked"]), reasonCodes: z.array(nonEmpty) }).strict();
const route = z.object({
  planningPolicy: z.literal("full_public_catalog_v1").optional(),
  venueCompatibility: z.literal("unchecked").optional(),
  schedule: routeSchedule.optional(),
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
  confirmationStatus: z.enum(["ready", "confirmation_required"]).optional(),
  style: z.enum(["balanced", "shortest", "relaxed"]).optional(),
  objective: z.enum(["balanced", "shortest", "relaxed"]).optional(),
  routeSignature: nonEmpty.optional(),
  requestedTarget: z.number().int().min(1).max(5).optional(),
  reductionStatus: z.enum(["complete", "reduced", "single_stop"]).optional(),
  personalizationExplanationCodes: z.array(nonEmpty).optional(),
  maximumSingleWaitSeconds: nonNegative.optional(),
  estimatedFinishAt: z.string().datetime().nullable().optional(),
  categoryComposition: z.record(category, z.number().int().nonnegative()).optional(),
  selectedPlaceCount: z.number().int().nonnegative().optional(),
  automaticPlaceCount: z.number().int().nonnegative().optional(),
  evidenceWarnings: z.array(nonEmpty).optional(),
  warningCodes: z.array(nonEmpty).optional(),
  reductionReasonCodes: z.array(nonEmpty).optional(),
  differenceExplanationCodes: z.array(nonEmpty).optional(),
  segments: z.array(z.object({
    fromPlaceId: nonEmpty,
    toPlaceId: nonEmpty,
    travelSeconds: nonNegative,
    distanceMeters: nonNegative,
    temporalBasis: nonEmpty,
  }).strict()).optional(),
}).strict();
const alternative = route.extend({
  kind: z.literal("optimized"),
  alternativeType: z.enum(["lower_travel", "popularity_oriented"]),
});
export const recommendationProductRouteSchema = route;
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
    "selected_place_confirmation_required",
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
const safeDiagnostics = z.object({
  catalogCoverage: z.object({
    pages: nonNegative,
    unavailableSources: z.array(nonEmpty),
    sourceCounts: z.object({ kto: nonNegative, kakao: nonNegative }).strict(),
    entities: z.object({ ktoOnly: nonNegative, kakaoOnly: nonNegative, merged: nonNegative }).strict(),
    identities: z.array(z.object({ rawId: nonEmpty, canonicalId: nonEmpty.nullable(), outcome: z.enum(["canonical", "alias", "excluded"]), reason: nonEmpty.optional() }).strict()),
    scoredIds: z.array(nonEmpty), shortlistIds: z.array(nonEmpty), reserveIds: z.array(nonEmpty),
    matrixNodeIds: z.array(nonEmpty),
    matrixEdges: z.array(z.object({ fromId: nonEmpty, toId: nonEmpty, status: nonEmpty, source: nonEmpty, reasonCodes: z.array(nonEmpty) }).strict()),
    matrixProviderCalls: nonNegative, matrixAttempts: nonNegative,
    feasibleIds: z.array(nonEmpty), finalUsedIds: z.array(nonEmpty), evidenceGateRejections: nonNegative,
  }).strict().optional(),
  candidateFunnel: z.object({
    observations: z.object({ detailedBySource: z.object({ kto: nonNegative, kakao: nonNegative }).strict(), conditions: z.object({ guidance: nonNegative, material: nonNegative, incompatible: nonNegative, unknown: nonNegative }).strict(), uniqueRejectedIds: nonNegative, rejectionReasonOccurrences: nonNegative, calendarDateSelected: z.boolean() }).strict().optional(),
    version: z.literal("candidate-funnel-v1"),
    catalog: z.object({
      publishedRegionalCatalog: z.number().int().nonnegative(),
      core: z.number().int().nonnegative(),
      shopping: z.number().int().nonnegative(),
      detailedEvidence: z.number().int().nonnegative(),
      listOnly: z.number().int().nonnegative(),
    }).strict(),
    petEvidence: z.object({
      verified: z.number().int().nonnegative(),
      conditional: z.number().int().nonnegative(),
      unknown: z.number().int().nonnegative(),
      notAllowed: z.number().int().nonnegative(),
    }).strict(),
    stages: z.object({
      activeRecords: z.number().int().nonnegative(),
      stableIdentityUnique: z.number().int().nonnegative(),
      requestedRegion: z.number().int().nonnegative(),
      requestedDistrict: z.number().int().nonnegative(),
      supportedCategories: z.number().int().nonnegative(),
      petEvidenceEligible: z.number().int().nonnegative(),
      canonicalConditionEligible: z.number().int().nonnegative(),
      operatingHoursEligible: z.number().int().nonnegative(),
      dateTimeFeasible: z.number().int().nonnegative(),
      departureDistanceFeasible: z.number().int().nonnegative(),
      matrixFeasible: z.number().int().nonnegative(),
      optimizerInput: z.number().int().nonnegative(),
    }).strict(),
    rejectedByReason: z.record(z.string(), z.number().int().nonnegative()),
  }).strict().optional(),
  candidatePipeline: z.object({
    stageA: z.number().int().nonnegative(),
    stageB: z.number().int().nonnegative(),
    detailedEvaluations: z.number().int().nonnegative(),
    eligible: z.number().int().nonnegative(),
  }).strict(),
  candidateEligibility: z.object({
    providerRawCandidates: z.number().int().nonnegative(),
    regionFilteredCandidates: z.number().int().nonnegative(),
    districtFilteredCandidates: z.number().int().nonnegative(),
    requestedCategoryCandidates: z.number().int().nonnegative(),
    petEligibleCandidates: z.number().int().nonnegative(),
    operatingHoursEligibleCandidates: z.number().int().nonnegative(),
    feasibleRouteCandidates: z.number().int().nonnegative(),
    finalUsedPlaces: z.number().int().nonnegative(),
    rejectedByReason: z.record(z.string(), z.number().int().nonnegative()),
  }).strict().optional(),
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
}).strict();
const diversity = z.object({
  scoredUniqueCandidateCount: z.number().int().nonnegative().optional(),
  unqueriedCandidateCount: z.number().int().nonnegative().optional(),
  eligibleUniqueCandidateCount: z.number().int().nonnegative(),
  requestedStopCount: z.number().int().min(1).max(5),
  unseenEligibleCandidateCount: z.number().int().nonnegative(),
  maximumFeasibleNovelReplacements: z.number().int().nonnegative(),
  diversityCapacity: z.enum(["sufficient", "limited", "exhausted"]),
  limitingReasonCodes: z.array(nonEmpty),
}).strict();
const failureWithSelection = failure.extend({
  selectionMode: z.enum(["automatic", "hybrid"]).optional(),
  selectionIssues: z.array(selectionIssue).optional(),
  replacementCandidates: z.array(replacementCandidate).max(3).optional(),
  routeOptions: z.array(route).min(1).max(3).optional(),
  diagnostics: safeDiagnostics.optional(),
  diversity: diversity.optional(),
});
const ready = z.object({
  status: z.literal("ready"),
  apiVersion: z.enum(["route-recommendation-response-v1", "route-recommendation-response-v2"]),
  engineVersion: z.enum(["petpass-route-engine-v1", "petpass-route-engine-v2"]),
  objectiveVersion: z.literal("route-objective-v1"),
  solverVersion: z.literal("route-solver-v1"),
  editSessionId: nonEmpty,
  requestSummary: z.object({
    departureLabel: nonEmpty,
    tripDate: z.string().date().nullable(),
    startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u).nullable(),
    tripType: z.enum(["day_trip", "overnight"]),
    tripPace: z.enum(["relaxed", "balanced", "packed"]),
    selectedCategories: z.array(category),
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
  region: z.enum(REGION_IDS).optional(),
  requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  resultState: z.enum(["ready", "ready_with_reduced_stops", "single_stop_suggestion"]).optional(),
  requestedStopCount: z.number().int().min(1).max(5).optional(),
  feasibleStopCount: z.number().int().min(0).max(5).optional(),
  resultReasonCodes: z.array(nonEmpty).optional(),
  resultExplanation: nonEmpty.optional(),
  recoveryActions: z.array(z.enum([
    "reduce_requested_stops",
    "change_time_window",
    "change_categories",
    "widen_district",
    "select_places_manually",
    "allow_verification_required_candidates",
    "acknowledge_selected_place_verification",
    "acknowledge_route_conditions",
  ])).optional(),
  routeOptions: z.array(route.extend({ kind: z.literal("optimized") })).min(1).max(3).optional(),
  primaryRouteId: nonEmpty.optional(),
  routeOptionCount: z.number().int().min(1).max(3).optional(),
  routeOptionsLimitedReason: z.enum([
    "fewer_than_three_meaningfully_distinct_routes",
    "final_validation_reduced_route_options",
    "novelty_quota_unmet",
  ]).optional(),
  candidateSourceCounts: z.object({
    kto: z.number().int().nonnegative(),
    kakao: z.number().int().nonnegative(),
    merged: z.number().int().nonnegative(),
  }).strict().optional(),
  alternativeAvailability: z.enum(["available", "limited"]).optional(),
  selectionMode: z.enum(["automatic", "hybrid"]).optional(),
  selectionIssues: z.array(selectionIssue).optional(),
  replacementCandidates: z.array(replacementCandidate).max(3).optional(),
  diagnostics: safeDiagnostics.optional(),
  diversity: diversity.optional(),
  historyContextKey: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  meaningfullyDifferent: z.boolean().optional(),
  newPlaceCount: z.number().int().nonnegative().optional(),
  sharedPlaceRatio: z.number().min(0).max(1).optional(),
  diversityCapacity: z.enum(["sufficient", "limited", "exhausted"]).optional(),
  diversityLimitedReasons: z.array(nonEmpty).optional(),
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
    conditionAnswers: z.array(z.object({ requirementId: z.string().regex(/^[a-f0-9]{64}$/), answer: z.enum(["confirmed", "not_applicable", "cannot_meet"]) }).strict()).max(100).refine((answers) => new Set(answers.map(({ requirementId }) => requirementId)).size === answers.length).optional(),
    applyScheduleProposal: z.literal(true).optional(),
  })
  .strict();

export const manualRouteValidationResponseSchema: z.ZodType<ManualRouteValidationResponseV1> =
  z.union([
    z.object({
      status: z.literal("ready"),
      apiVersion: z.enum(["route-recommendation-response-v1", "route-recommendation-response-v2"]),
      route: route.extend({ kind: z.literal("manual") }),
      warnings: z.array(nonEmpty),
      editSessionId: z.string().min(40).max(256_000).optional(),
    }),
    failureWithSelection,
  ]);
