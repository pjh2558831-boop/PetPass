import "server-only";
import { seoulDate } from "@/lib/recommendation/schedule/schedule-intent";

import { resolveDwellDurationV1 } from "@/lib/recommendation/config/dwell-duration-v1";
import type { DetailedEligibleCandidate } from "@/lib/recommendation/types";
import type {
  NormalizedVisitSchedule,
  RouteExposureResult,
  RouteOptimizationCandidate,
  RouteVisitRole,
} from "@/lib/recommendation/types/route-optimizer";

const RANGE_PATTERN = /(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)\s*(?:~|-|–|—)\s*([01]?\d|2[0-3]):([0-5]\d)(?=\D|$)/g;

export function normalizeSchedule(candidate: DetailedEligibleCandidate): NormalizedVisitSchedule {
  const stale = candidate.scheduleCompatibility.warningCodes.some(code => /stale|conflicting_or_partial/.test(code));
  const retrieved = candidate.scheduleDetail?.source?.retrievedAt;
  return { ...normalizeScheduleWindows(candidate), restDayInformation: stale ? null : candidate.scheduleDetail?.restDayInformation ?? null,
    ...(retrieved && Number.isFinite(Date.parse(retrieved)) ? { sourceDate: seoulDate(new Date(retrieved)) } : {}) };
}

function normalizeScheduleWindows(candidate: DetailedEligibleCandidate): NormalizedVisitSchedule {
  if (candidate.scheduleCompatibility.warningCodes.some(code => /stale|conflicting_or_partial/.test(code))) return { status: "unknown", windows: [], mandatoryReservationImpossible: false, source: "stage2_unknown", warningCodes: candidate.scheduleCompatibility.warningCodes };
  if (candidate.scheduleCompatibility.status === "unknown" && !candidate.scheduleDetail?.operatingInformation) {
    return {
      status: "unknown",
      windows: [],
      mandatoryReservationImpossible: false,
      source: "stage2_unknown",
      warningCodes: ["schedule_requires_route_time_confirmation"],
    };
  }
  const operating = candidate.scheduleDetail?.operatingInformation?.trim();
  if (!operating) {
    return {
      status: "unknown",
      windows: [],
      mandatoryReservationImpossible: false,
      source: "stage2_unknown",
      warningCodes: ["operating_hours_missing"],
    };
  }
  const breakText = operating.match(/(?:브레이크\s*타임|휴게\s*시간)[^0-9]{0,12}[0-2]?\d:[0-5]\d\s*[~–—-]\s*[0-2]?\d:[0-5]\d/)?.[0];
  const opening = breakText ? operating.replace(breakText, "") : operating;
  const finalEntry = operating.match(/(?:입장\s*마감|마지막\s*입장|라스트\s*오더)\s*[:：]?\s*([0-2]?\d):([0-5]\d)/);
  const matches = [...opening.matchAll(RANGE_PATTERN)];
  const ambiguous =
    matches.length !== 1 ||
    /break|last\s*entry|요일|주말|평일|공휴일|성수기|비수기|계절|마감|브레이크|라스트/i.test(
      finalEntry ? opening.replace(finalEntry[0], "") : opening,
    );
  if (ambiguous) {
    return {
      status: "unknown",
      windows: [],
      mandatoryReservationImpossible: false,
      source: "stage2_unknown",
      warningCodes: ["operating_hours_ambiguous"],
    };
  }
  const match = matches[0];
  const startMinutes = Number(match[1]) * 60 + Number(match[2]);
  const rawEnd = Number(match[3]) * 60 + Number(match[4]);
  const endMinutes = rawEnd < startMinutes ? rawEnd + 1440 : rawEnd;
  if (endMinutes === startMinutes) {
    return {
      status: "unknown",
      windows: [],
      mandatoryReservationImpossible: false,
      source: "stage2_unknown",
      warningCodes: ["operating_hours_overnight_or_invalid"],
    };
  }
  return {
    status: "known",
    windows: (() => {
      let finalEntryMinutes = finalEntry ? Number(finalEntry[1]) * 60 + Number(finalEntry[2]) : null;
      if (finalEntryMinutes !== null && finalEntryMinutes < startMinutes && endMinutes > 1440) finalEntryMinutes += 1440;
      const pause = breakText ? [...breakText.matchAll(RANGE_PATTERN)][0] : null;
      return pause ? [{ startMinutes, endMinutes: Number(pause[1]) * 60 + Number(pause[2]), finalEntryMinutes }, { startMinutes: Number(pause[3]) * 60 + Number(pause[4]), endMinutes, finalEntryMinutes }] : [{ startMinutes, endMinutes, finalEntryMinutes }];
    })(),
    mandatoryReservationImpossible: false,
    source: "provider_normalized",
    warningCodes: [],
  };
}

export function visitRole(candidate: DetailedEligibleCandidate): RouteVisitRole {
  switch (candidate.travelSuitability.travelRole) {
    case "meal":
      return "meal";
    case "cafe":
    case "rest_stop":
      return "rest";
    case "accommodation":
      return "accommodation";
    case "tourism_market":
      return "shopping";
    case "beach":
    case "park":
    case "walking_trail":
    case "viewpoint":
    case "cultural_venue":
    case "experience":
    case "photo_spot":
    case "indoor_activity":
    case "outdoor_activity":
    case "general_attraction":
      return "activity";
    default:
      return "other";
  }
}

export function isHighActivity(candidate: DetailedEligibleCandidate): boolean {
  return (
    candidate.category === "leisure" ||
    ["beach", "park", "walking_trail", "experience", "outdoor_activity"].includes(
      candidate.travelSuitability.travelRole ?? "",
    )
  );
}

export function adaptEligibleCandidateForRouteV1(input: {
  candidate: DetailedEligibleCandidate;
  exposure?: RouteExposureResult;
  providerDwellMinutes?: number | null;
  providerDwellReliable?: boolean;
}): RouteOptimizationCandidate {
  const { candidate } = input;
  if (
    !candidate.eligibility.eligible ||
    candidate.eligibility.status !== "eligible" ||
    candidate.eligibility.reasonCodes.length !== 0 ||
    !["allowed", "conditional"].includes(candidate.assessment.verdict) ||
    candidate.source !== "tourism_service2"
  ) {
    throw new TypeError("Stage 4 accepts only strict eligible Tourism Service2 candidates.");
  }
  const dwell = resolveDwellDurationV1({
    category: candidate.contentTypeId,
    providerDurationMinutes: input.providerDwellMinutes,
    providerDurationReliable: input.providerDwellReliable,
  });
  return {
    place: candidate,
    node: {
      id: candidate.contentId,
      kind: "place",
      name: candidate.title,
      latitude: candidate.coordinates.latitude,
      longitude: candidate.coordinates.longitude,
    },
    placeUtility: candidate.utility,
    dwellDurationMinutes: dwell.minutes,
    dwellDurationSource: dwell.source === "default" ? "category_default" : "provider",
    schedule: normalizeSchedule(candidate),
    category: candidate.category,
    visitRole: visitRole(candidate),
    diningCategory: candidate.category === "food"
      ? candidate.travelSuitability.travelRole === "cafe" ? "cafe" : "restaurant"
      : undefined,
    highActivity: isHighActivity(candidate),
    popularity: candidate.popularity,
    informationTrust: candidate.trust,
    exposure: input.exposure ?? {
      version: "exposure-v1",
      status: "not_available",
      score: null,
    },
    source: "tourism_service2",
    petAssessment: candidate.assessment.verdict as "allowed" | "conditional" | "unknown",
    evidenceStatus:
      candidate.eligibility.tier === "verified" ? "verified" :
      candidate.eligibility.tier === "unverified" ? "unverified" : "conditional",
    eligibilityTier:
      candidate.eligibility.tier === "verified" ? "verified" :
      candidate.eligibility.tier === "unverified" ? "unverified" : "conditional",
  };
}
