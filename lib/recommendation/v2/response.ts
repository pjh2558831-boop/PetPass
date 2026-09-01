import "server-only";

import { createHash } from "node:crypto";
import { applyCanonicalPetConditionPolicy } from "@/lib/pet-access/canonical-condition-eligibility";
import type { normalizeRecommendationRequest } from "@/lib/recommendation/recommendation-request";
import type { DetailedEligibleCandidate } from "@/lib/recommendation/types";
import type { RecommendedRouteStop, RouteOptimizationInput } from "@/lib/recommendation/types/route-optimizer";
import type { CanonicalRecommendationCandidateV2 } from "@/lib/recommendation/v2/candidate-fusion";
import { routeOptionScheduleV2, type OptimizedRouteOptionV2 } from "@/lib/recommendation/v2/route-optimizer";
import type { ProductRouteV1, RecommendedRouteStopV1 } from "@/types/recommendation";
import { ROUTE_RECOMMENDATION_CONTRACT_V2 } from "@/types/recommendation";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function requestFingerprintV2(input: {
  normalized: ReturnType<typeof normalizeRecommendationRequest>;
  catalogVersion: string;
  candidates: readonly CanonicalRecommendationCandidateV2[];
  selection?: { selectedPlaceIds: readonly string[]; autoFill: boolean };
  eligibilityPolicy?: {
    includeVerificationRequired: boolean;
    acknowledgedVerificationRequiredPlaceIds: readonly string[];
    selectedPlaceReferences: readonly { placeId: string; regionId: string }[];
  };
}): string {
  return createHash("sha256").update(stableJson({
    contractVersion: ROUTE_RECOMMENDATION_CONTRACT_V2,
    providerContracts: {
      kto: "KorPetTourService2",
      kakaoCatalog: "map-places-snapshot-v1",
      mobility: "travel-matrix-v1",
    },
    routeStyles: ["balanced", "shortest", "relaxed"],
    request: input.normalized,
    ...(input.selection ? { selection: input.selection } : {}),
    eligibilityPolicy: input.eligibilityPolicy,
    catalogVersion: input.catalogVersion,
    candidateGeneration: input.candidates.map((candidate) => ({
      id: candidate.canonicalId,
      providerIdentities: candidate.providerIdentities,
      retrievedAt: candidate.retrievedAt,
    })),
  }), "utf8").digest("hex");
}

function productStopV2(
  stop: RecommendedRouteStop,
  candidate: CanonicalRecommendationCandidateV2,
  licensingStatus: (candidate: DetailedEligibleCandidate) => RecommendedRouteStopV1["licensingStatus"],
  selectedPlaceIds?: ReadonlySet<string>,
  includeVerificationRequired = false,
  acknowledgedPlaceIds: ReadonlySet<string> = new Set(),
): RecommendedRouteStopV1 {
  const kto = candidate.ktoCandidate;
  const selected = selectedPlaceIds?.has(candidate.canonicalId) ?? false;
  const conditionPolicy = applyCanonicalPetConditionPolicy({
    analysis: candidate.conditionEligibility,
    flow: "route_option_validation",
    includeVerificationRequired,
    acknowledged: acknowledgedPlaceIds.has(candidate.canonicalId),
    preserveUserSelection: selected,
  });
  if (conditionPolicy.decision === "reject") {
    throw new TypeError(
      `Final V2 route stop failed canonical pet-condition validation: ${candidate.canonicalId}`,
    );
  }
  const kakaoConditionWarning = candidate.source === "kakao_catalog" && candidate.petConditions
    ? `반려견 동반 조건: ${candidate.petConditions} · 방문 전 업체에 최신 동반 조건을 확인해 주세요.`
    : null;
  const verificationWarning = conditionPolicy.decision === "confirmation_required"
    ? candidate.conditionEligibility.warnings[0]?.message ??
      "반려동물 동반 조건을 확인하고 동의해 주세요."
    : selected
      ? candidate.category === "shopping"
      ? "selected_shopping_requires_confirmation"
      : candidate.source === "kakao_catalog"
        ? kakaoConditionWarning ?? "selected_kakao_requires_confirmation"
        : candidate.evidenceStatus === "unverified" || candidate.petVerdict === "unknown"
          ? "selected_pet_policy_requires_confirmation"
          : null
      : null;
  return {
    placeId: candidate.canonicalId,
    sequence: stop.sequence,
    title: candidate.title,
    address: candidate.address,
    coordinates: candidate.coordinates,
    category: candidate.category,
    arrivalAt: stop.arrivalAt,
    visitStartsAt: stop.visitStartsAt,
    departureAt: stop.departureAt,
    dwellMinutes: stop.dwellMinutes,
    driveSecondsFromPrevious: stop.driveSecondsFromPrevious,
    distanceMetersFromPrevious: stop.distanceMetersFromPrevious,
    source: candidate.source,
    sourceLabel: candidate.sourceLabel,
    petAssessment: candidate.petVerdict,
    evidenceStatus: candidate.evidenceStatus,
    retrievedAt: candidate.retrievedAt,
    providerIdentities: candidate.providerIdentities,
    regionId: candidate.regionId,
    districtId: candidate.districtCode,
    selectionOrigin: candidate.selectionOrigin,
    operatingHoursEvidenceState: candidate.operatingHoursEvidenceState,
    ...(selectedPlaceIds ? {
      provenance: selected ? "user_selected" as const : "auto_fill" as const,
      locked: selected,
      verificationWarning,
    } : {}),
    petConditionEligibility: candidate.conditionEligibility,
    conditionAcknowledged: conditionPolicy.routeStatus === "ready",
    mandatoryConditions: kto?.assessment.conditions.map((condition) => ({
      type: condition.type,
      label: condition.label,
      manualConfirmationRecommended: condition.manualConfirmationRecommended,
    })) ?? [],
    informationTrust: stop.informationTrust,
    licensingStatus: kto ? licensingStatus(kto) : "not_applicable",
    operatingHoursWarnings: kto?.scheduleCompatibility.warningCodes ?? ["operating_hours_unverified"],
    inclusionReasonCodes: stop.inclusionReasonCodes,
    orderingReasonCodes: stop.orderingReasonCodes,
    warningCodes: [...new Set([
      ...stop.warningCodes,
      ...candidate.conditionEligibility.warnings.map(({ code }) => code),
      ...(verificationWarning ? [verificationWarning] : []),
    ])].sort(),
    evidence: kto?.assessment.evidence.slice(0, 9).map((evidence) => ({
      field: evidence.field,
      label: evidence.fieldLabel,
      originalText: evidence.originalText,
    })) ?? [],
  };
}

export function routeFromOptionV2(input: {
  option: OptimizedRouteOptionV2;
  optimization: RouteOptimizationInput;
  candidates: Map<string, CanonicalRecommendationCandidateV2>;
  requestedTarget: number;
  reductionReasonCodes?: readonly string[];
  licensingStatus: (candidate: DetailedEligibleCandidate) => RecommendedRouteStopV1["licensingStatus"];
  selectedPlaceIds?: ReadonlySet<string>;
  includeVerificationRequired?: boolean;
  acknowledgedPlaceIds?: ReadonlySet<string>;
}): ProductRouteV1 {
  const schedule = routeOptionScheduleV2(input.option, input.optimization);
  const stopCount = input.option.stops.length;
  const reductionStatus = stopCount === 1
    ? "single_stop" as const
    : stopCount < input.requestedTarget
      ? "reduced" as const
      : "complete" as const;
  const labels = {
    balanced: "균형 추천",
    shortest: "이동 최소",
    relaxed: "여유 일정",
  } as const;
  const stops = input.option.stops.map((stop) => {
    const candidate = input.candidates.get(stop.placeId);
    if (!candidate) {
      throw new TypeError("Final V2 route stop is outside the validated canonical candidate map.");
    }
    return productStopV2(
      stop,
      candidate,
      input.licensingStatus,
      input.selectedPlaceIds,
      input.includeVerificationRequired,
      input.acknowledgedPlaceIds,
    );
  });
  const categoryComposition = Object.fromEntries(
    [...new Set(stops.map(({ category }) => category))].sort().map((category) => [
      category,
      stops.filter((stop) => stop.category === category).length,
    ]),
  );
  const selectedPlaceCount = stops.filter(({ placeId }) => input.selectedPlaceIds?.has(placeId)).length;
  const maximumSingleWaitSeconds = Math.max(0, ...input.option.route.visits.map(({ waitSeconds }) => waitSeconds));
  return {
    id: `optimized:${input.option.style}:${input.option.route.signature}`,
    kind: "optimized",
    label: labels[input.option.style],
    style: input.option.style,
    objective: input.option.style,
    routeSignature: input.option.route.signature,
    requestedTarget: input.requestedTarget,
    reductionStatus,
    personalizationExplanationCodes: input.option.explanationCodes,
    differenceExplanationCodes: input.option.differenceExplanationCodes,
    reductionReasonCodes: [...new Set(input.reductionReasonCodes ?? [])].sort(),
    maximumSingleWaitSeconds,
    estimatedFinishAt: schedule.endAt,
    categoryComposition,
    selectedPlaceCount,
    automaticPlaceCount: stopCount - selectedPlaceCount,
    evidenceWarnings: [...new Set(stops.flatMap(({ warningCodes }) => warningCodes))].sort(),
    warningCodes: [...new Set([
      ...input.option.route.warningCodes,
      ...(input.option.route.totalWaitSeconds > 0 ? ["route_contains_waiting_time"] : []),
      ...(maximumSingleWaitSeconds >= 20 * 60 ? ["long_wait_within_pace_limit"] : []),
    ])].sort(),
    routeSummary: {
      startAt: schedule.startAt,
      endAt: schedule.endAt,
      stopCount,
      totalDistanceMeters: schedule.totalDistanceMeters,
      totalDrivingSeconds: schedule.totalDrivingSeconds,
      totalVisitSeconds: schedule.totalVisitSeconds,
      totalWaitSeconds: schedule.totalWaitSeconds,
    },
    temporalBasis: {
      searchMatrix: schedule.matrixTemporalBasis,
      finalRoute: schedule.finalValidationTemporalBasis,
    },
    stops,
    segments: input.option.segments.map((segment) => ({
      fromPlaceId: segment.fromId,
      toPlaceId: segment.toId,
      travelSeconds: segment.durationSeconds,
      distanceMeters: segment.distanceMeters,
      temporalBasis: input.option.temporalBasis,
    })),
    geometry: input.option.geometry,
    confirmationStatus: stops.some(({ conditionAcknowledged }) =>
      conditionAcknowledged === false)
      ? "confirmation_required"
      : "ready",
  };
}
