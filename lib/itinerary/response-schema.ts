import { z } from "zod";
import { parseKakaoPlaceUrl } from "@/lib/kakao/place-url";
import { PET_SIZE_COMPATIBILITY_STATES } from "@/types/pet-size-compatibility";
import { TOUR_CONTENT_TYPE_IDS } from "@/types/place";
import {
  ITINERARY_PROFILES,
  type ItineraryGenerationResponse,
} from "@/types/route-generation";
import {
  TOUR_PET_ACCESS_EVALUATION_STATES,
  TOUR_PET_ACCESS_VERDICTS,
} from "@/types/tour-pet-access";

const finiteNumberSchema = z.number().finite();
const nonNegativeNumberSchema = finiteNumberSchema.nonnegative();
const nonNegativeIntegerSchema = nonNegativeNumberSchema.int();
const nonEmptyStringSchema = z.string().min(1);
const sameDayTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u);
const tourImageUrlSchema = z.string().url().refine((value) => {
  const url = new URL(value);
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    url.hostname.toLowerCase() === "tong.visitkorea.or.kr" &&
    url.port === "" &&
    url.username === "" &&
    url.password === ""
  );
}, "Unsupported itinerary image URL");
const kakaoPlaceUrlSchema = z
  .string()
  .optional()
  .transform((value) => parseKakaoPlaceUrl(value) ?? undefined);

const coordinatesSchema = z.object({
  latitude: finiteNumberSchema.min(-90).max(90),
  longitude: finiteNumberSchema.min(-180).max(180),
});

const petSizeSchema = z.enum(["SMALL", "MEDIUM", "LARGE"]);
const tourPlaceCategorySchema = z.enum([
  "leisure",
  "attraction",
  "transportation",
  "culture",
  "shopping",
  "accommodation",
  "food",
  "festival",
  "unknown",
]);
const itineraryStopCategorySchema = z.enum([
  "leisure",
  "attraction",
  "culture",
  "shopping",
  "accommodation",
  "food",
  "festival",
]);

const petAccessScopeSchema = z.enum([
  "whole_place",
  "indoor",
  "outdoor",
  "terrace",
  "guest_room",
  "selected_room",
  "common_area",
  "restaurant",
  "cafe",
  "lobby",
  "designated_area",
  "transport",
  "unknown",
]);

const petAccessConditionTypeSchema = z.enum([
  "size_limit",
  "weight_limit",
  "breed_limit",
  "dangerous_dog_limit",
  "pet_count_limit",
  "leash_required",
  "harness_required",
  "muzzle_required",
  "carrier_required",
  "stroller_required",
  "vaccination_required",
  "document_required",
  "reservation_required",
  "advance_inquiry_required",
  "fee_required",
  "deposit_required",
  "designated_area_only",
  "outdoor_only",
  "indoor_restricted",
  "selected_room_only",
  "facility_restriction",
  "time_restriction",
  "owner_supervision",
  "sanitation_requirement",
  "assistance_animal_exception",
  "other",
]);

const petAccessReasonCodeSchema = z.enum([
  "explicit_allowance",
  "explicit_denial",
  "material_condition",
  "limited_scope",
  "same_scope_conflict",
  "inquiry_only",
  "no_meaningful_evidence",
  "primary_source_unavailable",
  "secondary_fallback_used",
  "unsupported_record",
  "unknown_structured_code",
]);

const petAccessConditionSchema = z.object({
  type: petAccessConditionTypeSchema,
  scope: petAccessScopeSchema,
  label: nonEmptyStringSchema,
  sourceText: z.string(),
  evidenceIds: z.array(nonEmptyStringSchema),
  structuredValue: z
    .object({
      value: finiteNumberSchema,
      unit: z.enum(["kg", "pets", "krw"]),
      comparator: z.enum(["maximum", "minimum", "exact"]),
    })
    .optional(),
  manualConfirmationRecommended: z.boolean(),
});

const petAccessEvidenceSchema = z.object({
  id: nonEmptyStringSchema,
  operation: z.enum(["detailPetTour2", "detailIntro2"]),
  field: nonEmptyStringSchema,
  fieldLabel: nonEmptyStringSchema,
  originalText: z.string(),
  assertion: z.enum([
    "allows",
    "denies",
    "limits",
    "inquiry_only",
    "unknown",
  ]),
  scope: petAccessScopeSchema,
  priority: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  providerModifiedTime: z.string().nullable(),
});

const petAccessConflictSchema = z.object({
  id: nonEmptyStringSchema,
  scope: petAccessScopeSchema,
  evidenceIds: z.array(nonEmptyStringSchema),
  summary: nonEmptyStringSchema,
});

const petAccessVerificationItemSchema = z.object({
  code: z.enum([
    "confirm_current_policy",
    "confirm_conflicting_policy",
    "confirm_unknown_provider_code",
    "confirm_missing_source",
  ]),
  label: nonEmptyStringSchema,
  evidenceIds: z.array(nonEmptyStringSchema),
});

const petAccessSourceSchema = z.object({
  operation: z.enum(["detailPetTour2", "detailIntro2"]),
  status: z.enum(["available", "empty", "unavailable"]),
  retrievedAt: z.string().datetime(),
  providerModifiedTime: z.string().nullable(),
});

const sizeCompatibilitySchema = z.object({
  rulesetVersion: z.literal("1"),
  requestedSize: petSizeSchema.nullable(),
  state: z.enum(PET_SIZE_COMPATIBILITY_STATES),
  reason: z.enum([
    "pet_size_not_requested",
    "no_explicit_size_evidence",
    "explicit_all_sizes",
    "explicit_size_allowance",
    "explicit_size_denial",
    "exact_weight_required",
    "ambiguous_size_restriction",
  ]),
  evidenceIds: z.array(nonEmptyStringSchema),
  sourceTexts: z.array(z.string()),
});

const generatedPetAccessSchema = z.object({
  verdict: z.enum(TOUR_PET_ACCESS_VERDICTS),
  evaluationState: z.enum(TOUR_PET_ACCESS_EVALUATION_STATES),
  permittedScopes: z.array(petAccessScopeSchema),
  restrictedScopes: z.array(petAccessScopeSchema),
  conditions: z.array(petAccessConditionSchema),
  sizeCompatibility: sizeCompatibilitySchema,
  summary: nonEmptyStringSchema.optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  reasonCodes: z.array(petAccessReasonCodeSchema).optional(),
  evidence: z.array(petAccessEvidenceSchema).optional(),
  conflicts: z.array(petAccessConflictSchema).optional(),
  verificationItems: z.array(petAccessVerificationItemSchema).optional(),
  sources: z.array(petAccessSourceSchema).optional(),
  warnings: z.array(z.string()).optional(),
});

const travelRoleSchema = z.enum([
  "beach",
  "park",
  "walking_trail",
  "viewpoint",
  "cultural_venue",
  "experience",
  "photo_spot",
  "cafe",
  "meal",
  "rest_stop",
  "indoor_activity",
  "outdoor_activity",
  "accommodation",
  "tourism_market",
  "general_attraction",
]);

const travelSuitabilityExclusionReasonSchema = z.enum([
  "medical_business",
  "household_or_wedding_retail",
  "optical_or_beauty_service",
  "finance_or_daily_service",
  "generic_retail",
  "pet_supply_only",
  "non_visitor_facility",
  "shopping_disabled",
  "shopping_missing_travel_role",
  "invalid_coordinates",
  "outside_selected_region",
  "closed_or_unusable",
  "unsupported_record",
]);

const travelSuitabilitySchema = z.object({
  travelSuitable: z.boolean(),
  travelRole: travelRoleSchema.nullable(),
  normalizedCategory: itineraryStopCategorySchema.nullable(),
  recommendationTier: z.enum([
    "verified",
    "conditional",
    "exploratory",
    "excluded",
  ]),
  exclusionReason: travelSuitabilityExclusionReasonSchema.nullable(),
  eligibilityReason: z.string().nullable(),
  evidence: z.array(
    z.object({
      source: z.enum([
        "tour_content_type",
        "tour_classification",
        "tour_name",
        "region",
        "kakao_category",
        "pet_evidence",
      ]),
      code: nonEmptyStringSchema,
      value: z.string(),
    }),
  ),
  source: z.object({
    provider: z.enum(["Korea Tourism Organization", "Kakao Local"]),
    identity: nonEmptyStringSchema,
  }),
  petVerificationState: z.enum([
    "verified",
    "conditional",
    "verification_required",
    "not_allowed",
    "unknown",
  ]),
  scoringEligible: z.boolean(),
});

const placeScoreSchema = z.object({
  total: finiteNumberSchema,
  components: z.object({
    petCompatibility: finiteNumberSchema,
    preferenceMatch: finiteNumberSchema,
    travelAttractiveness: finiteNumberSchema,
    scheduleFit: finiteNumberSchema,
    informationCompleteness: finiteNumberSchema,
    kakaoRelevance: finiteNumberSchema,
  }),
  reasons: z.array(z.string()),
  evidenceCodes: z.array(z.string()),
});

const routeScoreSchema = z.object({
  total: finiteNumberSchema,
  qualityRatio: finiteNumberSchema,
  components: z.object({
    placeScoreTotal: finiteNumberSchema,
    preferenceCoverage: finiteNumberSchema,
    travelRoleDiversity: finiteNumberSchema,
    scheduleFit: finiteNumberSchema,
    travelTimePenalty: finiteNumberSchema,
    backtrackingPenalty: finiteNumberSchema,
    repeatedCategoryPenalty: finiteNumberSchema,
    unverifiedPlaceRisk: finiteNumberSchema,
  }),
});

const generatedItineraryStopSchema = z.object({
  order: z.number().int().min(1).max(5),
  stableIdentity: nonEmptyStringSchema,
  source: z.enum(["TOUR_API", "KAKAO"]),
  contentId: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  address: z.string().nullable(),
  coordinates: coordinatesSchema,
  providerContentTypeId: nonEmptyStringSchema,
  contentTypeId: z.enum(TOUR_CONTENT_TYPE_IDS),
  category: itineraryStopCategorySchema,
  plannedArrival: sameDayTimeSchema,
  plannedDeparture: sameDayTimeSchema,
  visitDurationMinutes: nonNegativeIntegerSchema,
  distanceFromPreviousMeters: nonNegativeNumberSchema,
  durationFromPreviousSeconds: nonNegativeNumberSchema,
  petAccess: generatedPetAccessSchema,
  operatingHours: z.object({
    status: z.enum(["open", "unknown"]),
    warning: z.literal("운영시간 확인 필요").nullable(),
  }),
  travelSuitability: travelSuitabilitySchema,
  placeScore: placeScoreSchema,
  recommendationReasons: z.array(z.string()),
  callAheadRequired: z.boolean(),
  imageUrl: tourImageUrlSchema.optional(),
  phone: z.string().optional(),
  placeUrl: kakaoPlaceUrlSchema,
  verifiedReplacementIdentity: z.string().optional(),
});

const generatedItinerarySchema = z.object({
  id: nonEmptyStringSchema,
  signature: nonEmptyStringSchema,
  profile: z.enum(ITINERARY_PROFILES),
  title: nonEmptyStringSchema,
  explanation: z.string(),
  stops: z.array(generatedItineraryStopSchema).min(1).max(5),
  totalDistanceMeters: nonNegativeNumberSchema,
  totalDurationSeconds: nonNegativeNumberSchema,
  estimatedElapsedDurationMinutes: nonNegativeIntegerSchema,
  geometry: z.array(coordinatesSchema),
  routeScore: routeScoreSchema,
});

const exclusionCountsSchema = z.object({
  shopping_disabled: nonNegativeIntegerSchema,
  unsupported_record: nonNegativeIntegerSchema,
  malformed_record: nonNegativeIntegerSchema,
  malformed_coordinates: nonNegativeIntegerSchema,
  travel_unsuitable: nonNegativeIntegerSchema,
  candidate_limit: nonNegativeIntegerSchema,
  detail_unavailable: nonNegativeIntegerSchema,
  detail_mismatch: nonNegativeIntegerSchema,
  not_allowed: nonNegativeIntegerSchema,
  unknown: nonNegativeIntegerSchema,
  not_applicable: nonNegativeIntegerSchema,
  pet_size_incompatible: nonNegativeIntegerSchema,
  pet_size_verification_required: nonNegativeIntegerSchema,
  equipment_incompatible: nonNegativeIntegerSchema,
  indoor_requirement: nonNegativeIntegerSchema,
  closed_at_visit: nonNegativeIntegerSchema,
  check_in_unavailable: nonNegativeIntegerSchema,
  duration_exceeded: nonNegativeIntegerSchema,
  directions_unavailable: nonNegativeIntegerSchema,
  diversity_duplicate: nonNegativeIntegerSchema,
  recent_signature: nonNegativeIntegerSchema,
});

const candidateFunnelSchema = z.object({
  matchingCatalogCandidates: nonNegativeIntegerSchema,
  afterBasicFilters: nonNegativeIntegerSchema,
  travelSuitableCandidates: nonNegativeIntegerSchema,
  travelSuitabilityExcluded: nonNegativeIntegerSchema,
  preliminaryRankedCandidates: nonNegativeIntegerSchema,
  detailedAssessmentCandidates: nonNegativeIntegerSchema,
  detailOutcomes: z.object({
    unavailable: nonNegativeIntegerSchema,
    mismatch: nonNegativeIntegerSchema,
  }),
  basePetAccess: z.object({
    allowed: nonNegativeIntegerSchema,
    conditional: nonNegativeIntegerSchema,
    notAllowed: nonNegativeIntegerSchema,
    unknown: nonNegativeIntegerSchema,
    notApplicable: nonNegativeIntegerSchema,
  }),
  petSizeCompatibility: z.object({
    compatible: nonNegativeIntegerSchema,
    incompatible: nonNegativeIntegerSchema,
    verificationRequired: nonNegativeIntegerSchema,
    notSpecified: nonNegativeIntegerSchema,
  }),
  equipmentMismatchExcluded: nonNegativeIntegerSchema,
  indoorRequirementExcluded: nonNegativeIntegerSchema,
  itineraryEligibleCandidates: nonNegativeIntegerSchema,
  generatedCombinations: nonNegativeIntegerSchema,
  returnedRoutes: nonNegativeIntegerSchema,
});

const normalizedRequestSchema = z.object({
  scope: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("busan"),
      regionCode: z.literal("26"),
      regionName: z.literal("부산 전체"),
    }),
    z.object({
      type: z.literal("district"),
      regionCode: z.literal("26"),
      regionName: z.literal("부산"),
      districtCode: nonEmptyStringSchema,
      districtName: nonEmptyStringSchema,
    }),
  ]),
  start: z.object({
    coordinates: coordinatesSchema,
    label: z.string().nullable(),
  }),
  travelDate: z.string().date(),
  startTime: sameDayTimeSchema,
  planningMode: z.enum(["duration", "stop_count"]),
  desiredDurationMinutes: z.number().int().min(120).max(600).nullable(),
  desiredStopCount: z.number().int().min(1).max(5),
  petSize: petSizeSchema.nullable(),
  petEquipment: z.object({
    hasCarrier: z.boolean().nullable(),
    hasLeash: z.boolean().nullable(),
    hasMuzzle: z.boolean().nullable(),
  }),
  indoorAccessPreference: z.enum(["any", "preferred", "required"]),
  selectedCategories: z.array(tourPlaceCategorySchema).min(1),
  includeShopping: z.boolean(),
  generationSeed: nonEmptyStringSchema,
  recentRouteSignatures: z.array(nonEmptyStringSchema).max(12),
});

export const itineraryGenerationResponseSchema: z.ZodType<ItineraryGenerationResponse> =
  z.object({
    state: z.enum([
      "ready",
      "partial",
      "insufficient_candidates",
      "provider_unavailable",
    ]),
    request: normalizedRequestSchema,
    providerCandidatesConsidered: nonNegativeIntegerSchema,
    shortlistedCandidates: nonNegativeIntegerSchema,
    eligibleCandidates: nonNegativeIntegerSchema,
    candidateFunnel: candidateFunnelSchema,
    exclusionCounts: exclusionCountsSchema,
    travelSuitabilityExclusions: z.record(
      travelSuitabilityExclusionReasonSchema,
      nonNegativeIntegerSchema,
    ),
    providerCalls: z.object({
      detail: nonNegativeIntegerSchema,
      directions: nonNegativeIntegerSchema,
      discovery: nonNegativeIntegerSchema,
    }),
    limits: z.object({
      maxCatalogCandidates: nonNegativeIntegerSchema,
      maxDetailCalls: nonNegativeIntegerSchema,
      maxDirectionsCalls: nonNegativeIntegerSchema,
      detailConcurrency: nonNegativeIntegerSchema,
      catalogConcurrency: nonNegativeIntegerSchema,
      maxCatalogPagesPerContentType: nonNegativeIntegerSchema,
      maxCourseCombinations: nonNegativeIntegerSchema,
    }),
    itineraries: z.array(generatedItinerarySchema).max(3),
    notices: z.array(z.string()),
  });

export function parseItineraryGenerationResponse(
  value: unknown,
): ItineraryGenerationResponse {
  return itineraryGenerationResponseSchema.parse(value);
}
