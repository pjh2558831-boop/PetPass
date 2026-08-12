/**
 * SYNTHETIC TEST FIXTURE for the candidate-pipeline-v1 controlled comparison.
 *
 * The identifiers, coordinates, scores, and decisions below are invented for
 * deterministic tests. This file is never a production provider fallback and
 * contains no copied provider policy text.
 */

export const CONTROLLED_FIXTURE_VERSION =
  "candidate-pipeline-v1-controlled-fixture" as const;

export type ControlledCategory =
  | "attraction"
  | "culture"
  | "festival"
  | "leisure"
  | "accommodation"
  | "shopping"
  | "food";

export type ControlledScheduleCompatibility =
  | "compatible"
  | "unknown"
  | "conflict"
  | "provider_unavailable";

export interface ControlledCandidateFixture {
  contentId: string;
  contentTypeId: "12" | "14" | "15" | "28" | "32" | "38" | "39";
  category: ControlledCategory;
  title: string;
  coordinates: { latitude: number; longitude: number };
  providerVisibility:
    | "exposed"
    | "not_exposed"
    | "unknown"
    | "provider_unavailable";
  listDataQuality: number;
  popularityPrior: number;
  scheduleCompatibility: ControlledScheduleCompatibility;
  strictEligible: boolean;
  eligibilityReasonCodes: string[];
  utilityScore: number;
  detailFailure: boolean;
}

export interface ControlledComparisonScenario {
  id:
    | "relaxed_activity"
    | "balanced_food"
    | "packed_overnight"
    | "packed_sparse_activity";
  label: string;
  tripType: "DAY_TRIP" | "OVERNIGHT";
  tripPace: "relaxed" | "balanced" | "packed";
  minStops: number;
  maxStops: number;
  start: { latitude: number; longitude: number };
  selectedCategories: ControlledCategory[];
  includeShopping: boolean;
}

const START = { latitude: 35.1151, longitude: 129.0414 } as const;

const TYPE_BY_CATEGORY = {
  attraction: "12",
  culture: "14",
  festival: "15",
  leisure: "28",
  accommodation: "32",
  shopping: "38",
  food: "39",
} as const;

function candidate(
  contentId: string,
  category: ControlledCategory,
  offset: number,
  options: Partial<
    Omit<
      ControlledCandidateFixture,
      "contentId" | "contentTypeId" | "category" | "title" | "coordinates"
    >
  > = {},
): ControlledCandidateFixture {
  return {
    contentId,
    contentTypeId: TYPE_BY_CATEGORY[category],
    category,
    title: `Synthetic ${category} ${contentId}`,
    coordinates: {
      latitude: START.latitude + offset / 10_000,
      longitude: START.longitude + offset / 10_000,
    },
    providerVisibility: options.providerVisibility ?? "exposed",
    listDataQuality: options.listDataQuality ?? 0.75,
    popularityPrior: options.popularityPrior ?? 0.5,
    scheduleCompatibility: options.scheduleCompatibility ?? "compatible",
    strictEligible: options.strictEligible ?? false,
    eligibilityReasonCodes:
      options.eligibilityReasonCodes ?? ["pet_access_unknown"],
    utilityScore: options.utilityScore ?? 0,
    detailFailure: options.detailFailure ?? false,
  };
}

const nearAttractions: ControlledCandidateFixture[] = [
  candidate("fixture-a01", "attraction", 1, {
    eligibilityReasonCodes: ["pet_access_unknown"],
  }),
  candidate("fixture-a02", "attraction", 2),
  candidate("fixture-a03", "attraction", 3, {
    eligibilityReasonCodes: ["pet_access_not_allowed"],
  }),
  candidate("fixture-a04", "attraction", 4, {
    eligibilityReasonCodes: ["mandatory_condition_unsatisfied"],
  }),
  candidate("fixture-a05", "attraction", 5, {
    strictEligible: true,
    eligibilityReasonCodes: [],
    utilityScore: 720,
    listDataQuality: 0.95,
    popularityPrior: 0.9,
  }),
  candidate("fixture-a06", "attraction", 6, {
    eligibilityReasonCodes: ["pet_evidence_absent"],
  }),
  candidate("fixture-a07", "attraction", 7, {
    eligibilityReasonCodes: ["pet_size_verification_required"],
  }),
  candidate("fixture-a08", "attraction", 8, {
    detailFailure: true,
    eligibilityReasonCodes: ["required_pet_detail_call_unavailable"],
  }),
  candidate("fixture-a09", "attraction", 9, {
    providerVisibility: "not_exposed",
    eligibilityReasonCodes: ["provider_visibility_not_exposed"],
  }),
  candidate("fixture-a10", "attraction", 10, {
    eligibilityReasonCodes: ["pet_type_verification_required"],
  }),
  candidate("fixture-a11", "attraction", 11, {
    scheduleCompatibility: "conflict",
    eligibilityReasonCodes: ["operating_time_conflict"],
  }),
  candidate("fixture-a12", "attraction", 12),
  candidate("fixture-a13", "attraction", 13, {
    strictEligible: true,
    eligibilityReasonCodes: [],
    utilityScore: 700,
    listDataQuality: 0.95,
    popularityPrior: 0.9,
  }),
  candidate("fixture-a14", "attraction", 14),
  candidate("fixture-a15", "attraction", 15, {
    scheduleCompatibility: "unknown",
  }),
  candidate("fixture-a16", "attraction", 16, {
    strictEligible: true,
    eligibilityReasonCodes: [],
    utilityScore: 680,
    listDataQuality: 0.95,
    popularityPrior: 0.9,
  }),
  candidate("fixture-a17", "attraction", 17, {
    strictEligible: true,
    eligibilityReasonCodes: [],
    utilityScore: 660,
    listDataQuality: 0.95,
    popularityPrior: 0.9,
  }),
  candidate("fixture-a18", "attraction", 18, {
    scheduleCompatibility: "provider_unavailable",
    eligibilityReasonCodes: ["required_intro_detail_call_unavailable"],
  }),
];

const coverageCandidates: ControlledCandidateFixture[] = [
  candidate("fixture-c01", "culture", 35, {
    eligibilityReasonCodes: ["pet_access_unknown"],
  }),
  candidate("fixture-c02", "culture", 36, {
    scheduleCompatibility: "unknown",
    strictEligible: true,
    eligibilityReasonCodes: [],
    utilityScore: 740,
    listDataQuality: 0.95,
    popularityPrior: 0.9,
  }),
  candidate("fixture-l01", "leisure", 40, {
    eligibilityReasonCodes: ["pet_access_unknown"],
  }),
  candidate("fixture-l02", "leisure", 41, {
    strictEligible: true,
    eligibilityReasonCodes: [],
    utilityScore: 790,
    listDataQuality: 0.95,
    popularityPrior: 0.9,
  }),
  candidate("fixture-l03", "leisure", 42, {
    eligibilityReasonCodes: ["mandatory_condition_verification_required"],
  }),
  candidate("fixture-f01", "food", 45, {
    eligibilityReasonCodes: ["pet_access_unknown"],
  }),
  candidate("fixture-f02", "food", 46, {
    scheduleCompatibility: "unknown",
    strictEligible: true,
    eligibilityReasonCodes: [],
    utilityScore: 775,
    listDataQuality: 0.95,
    popularityPrior: 0.9,
  }),
  candidate("fixture-f03", "food", 47, {
    scheduleCompatibility: "conflict",
    eligibilityReasonCodes: ["operating_time_conflict"],
  }),
  candidate("fixture-h01", "accommodation", 50, {
    eligibilityReasonCodes: ["pet_access_unknown"],
  }),
  candidate("fixture-h02", "accommodation", 51, {
    strictEligible: true,
    eligibilityReasonCodes: [],
    utilityScore: 800,
    listDataQuality: 0.95,
    popularityPrior: 0.9,
  }),
  candidate("fixture-h03", "accommodation", 52, {
    detailFailure: true,
    eligibilityReasonCodes: ["required_common_detail_call_unavailable"],
  }),
  candidate("fixture-s01", "shopping", 55, {
    strictEligible: true,
    eligibilityReasonCodes: [],
    utilityScore: 690,
  }),
  candidate("fixture-s02", "shopping", 56, {
    strictEligible: true,
    eligibilityReasonCodes: [],
    utilityScore: 650,
  }),
];

export const CONTROLLED_CANDIDATE_FIXTURES = [
  ...nearAttractions,
  ...coverageCandidates,
  // Exact duplicate identity verifies that both arms report de-duplication.
  { ...coverageCandidates.find(({ contentId }) => contentId === "fixture-f01")! },
] as const satisfies readonly ControlledCandidateFixture[];

export const CONTROLLED_COMPARISON_SCENARIOS = [
  {
    id: "relaxed_activity",
    label: "Relaxed day trip with activity coverage",
    tripType: "DAY_TRIP",
    tripPace: "relaxed",
    minStops: 2,
    maxStops: 3,
    start: START,
    selectedCategories: ["attraction", "culture", "leisure"],
    includeShopping: false,
  },
  {
    id: "balanced_food",
    label: "Balanced day trip with a selected meal category",
    tripType: "DAY_TRIP",
    tripPace: "balanced",
    minStops: 3,
    maxStops: 4,
    start: START,
    selectedCategories: ["attraction", "culture", "leisure", "food"],
    includeShopping: false,
  },
  {
    id: "packed_overnight",
    label: "Packed overnight trip with accommodation coverage",
    tripType: "OVERNIGHT",
    tripPace: "packed",
    minStops: 4,
    maxStops: 5,
    start: START,
    selectedCategories: [
      "attraction",
      "culture",
      "leisure",
      "food",
      "accommodation",
    ],
    includeShopping: false,
  },
  {
    id: "packed_sparse_activity",
    label: "Packed day trip that must backfill beyond the first 15 details",
    tripType: "DAY_TRIP",
    tripPace: "packed",
    minStops: 4,
    maxStops: 5,
    start: START,
    selectedCategories: ["attraction", "culture"],
    includeShopping: false,
  },
] as const satisfies readonly ControlledComparisonScenario[];
