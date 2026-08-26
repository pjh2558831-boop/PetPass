import "server-only";

import { PLACE_UTILITY_V1_CONFIG } from "@/lib/recommendation/config/place-utility-v1";
import type { PopularityResult } from "@/lib/recommendation/popularity/popularity-calculator";
import { PLACE_TRUST_RULE_VERSION } from "@/lib/trust/rules";
import type { PlaceTrustResult } from "@/types/place-source";
import type { AutomaticRouteEligibilityResult } from "@/types/route-eligibility";
import type { TourPetAccessSemanticAssessment } from "@/types/tour-pet-access";

export interface PlaceUtilityWeightedContributions {
  preferenceFit: number;
  petCompatibility: number;
  informationTrust: number;
  popularity: number;
  categoryPriority: number;
  dataQuality: number;
}

export interface PlaceUtilityBreakdown {
  version: "place-utility-v1";
  total: number;
  preferenceFit: number;
  petCompatibility: number;
  informationTrust: number;
  popularity: number;
  categoryPriority: number;
  dataQuality: number;
  weightedContributions: PlaceUtilityWeightedContributions;
  reasonCodes: string[];
  warningCodes: string[];
}

export interface PlaceUtilityV1Input {
  eligibility: AutomaticRouteEligibilityResult;
  petAccessAssessment: Pick<
    TourPetAccessSemanticAssessment,
    "verdict" | "evaluationState"
  >;
  informationTrust: PlaceTrustResult;
  popularity: PopularityResult;
  preferenceFit: number;
  categoryPriority: number;
  dataQuality: number;
  reasonCodes?: readonly string[];
  warningCodes?: readonly string[];
}

const COMPONENT_ORDER = [
  "preferenceFit",
  "petCompatibility",
  "informationTrust",
  "popularity",
  "categoryPriority",
  "dataQuality",
] as const satisfies readonly (keyof PlaceUtilityWeightedContributions)[];

function normalized(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be normalized to [0, 1]`);
  }
  return value;
}

function apportionContributions(
  components: Record<(typeof COMPONENT_ORDER)[number], number>,
): { total: number; contributions: PlaceUtilityWeightedContributions } {
  const raw = COMPONENT_ORDER.map((name, index) => {
    const scaled =
      components[name] *
      PLACE_UTILITY_V1_CONFIG.weights[name] *
      PLACE_UTILITY_V1_CONFIG.scale;
    return { name, index, scaled, floor: Math.floor(scaled) };
  });
  const total = Math.floor(
    raw.reduce((sum, item) => sum + item.scaled, 0) + 0.5,
  );
  let remaining = total - raw.reduce((sum, item) => sum + item.floor, 0);
  const byRemainder = [...raw].sort(
    (left, right) =>
      right.scaled - right.floor - (left.scaled - left.floor) ||
      left.index - right.index,
  );
  const values = new Map(raw.map((item) => [item.name, item.floor]));
  for (const item of byRemainder) {
    if (remaining <= 0) break;
    values.set(item.name, (values.get(item.name) ?? 0) + 1);
    remaining -= 1;
  }
  return {
    total,
    contributions: Object.fromEntries(
      COMPONENT_ORDER.map((name) => [name, values.get(name) ?? 0]),
    ) as unknown as PlaceUtilityWeightedContributions,
  };
}

export function scorePlaceUtilityV1(
  input: PlaceUtilityV1Input,
): PlaceUtilityBreakdown | null {
  const eligibilityTier = input.eligibility.tier ??
    (input.petAccessAssessment.verdict === "allowed"
      ? "verified"
      : "conditional");
  if (
    !input.eligibility.eligible ||
    eligibilityTier === "explicitly_ineligible"
  ) {
    return null;
  }
  if (input.informationTrust.ruleVersion !== PLACE_TRUST_RULE_VERSION) {
    throw new RangeError("informationTrust must use the canonical trust rule version");
  }
  if (input.popularity.version !== "popularity-v1") {
    throw new RangeError("popularity must use popularity-v1");
  }

  const suppliedPopularity = normalized(
    input.popularity.score,
    "popularity.score",
  );
  const popularity =
    input.popularity.status === "insufficient_data"
      ? 0.5
      : suppliedPopularity;
  const components = {
    preferenceFit: normalized(input.preferenceFit, "preferenceFit"),
    petCompatibility:
      eligibilityTier === "verified"
        ? PLACE_UTILITY_V1_CONFIG.petCompatibility.allowed
        : eligibilityTier === "conditional"
          ? PLACE_UTILITY_V1_CONFIG.petCompatibility.compatibleConditional
          : PLACE_UTILITY_V1_CONFIG.petCompatibility.unverified,
    informationTrust: normalized(
      input.informationTrust.score / 100,
      "informationTrust.score",
    ),
    popularity,
    categoryPriority: normalized(input.categoryPriority, "categoryPriority"),
    dataQuality: normalized(input.dataQuality, "dataQuality"),
  };
  const { total, contributions } = apportionContributions(components);
  const reasonCodes = new Set(input.reasonCodes ?? []);
  reasonCodes.add(
    eligibilityTier === "verified"
      ? "pet_access_allowed"
      : eligibilityTier === "conditional"
        ? "pet_access_compatible_conditional"
        : "pet_access_unverified_active",
  );
  reasonCodes.add("canonical_information_trust_used");
  const warningCodes = new Set(input.warningCodes ?? []);
  if (input.popularity.status === "insufficient_data") {
    warningCodes.add("popularity_insufficient_data");
  }
  if (eligibilityTier === "unverified") {
    warningCodes.add("pet_evidence_unverified");
  }

  return {
    version: PLACE_UTILITY_V1_CONFIG.version,
    total,
    ...components,
    weightedContributions: contributions,
    reasonCodes: [...reasonCodes].sort((left, right) => left.localeCompare(right)),
    warningCodes: [...warningCodes].sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}
