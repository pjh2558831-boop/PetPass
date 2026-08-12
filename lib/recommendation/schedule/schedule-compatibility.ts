import "server-only";

import {
  assessOperatingHours,
  UNKNOWN_OPERATING_HOURS_WARNING,
} from "@/lib/itinerary/operating-hours";
import { CANDIDATE_PIPELINE_V1_CONFIG } from "@/lib/recommendation/config/candidate-pipeline-v1";
import type { TourPlaceScheduleDetail } from "@/lib/tour-api/service";
import type { ScheduleCompatibilityResult } from "@/lib/recommendation/types";

export interface ScheduleCompatibilityInput {
  detail: TourPlaceScheduleDetail | null;
  providerAvailable: boolean;
  travelDate: string;
  /** Immutable pipeline snapshot used to reject stale/future schedule text. */
  asOf: string;
  /** Null until a later route stage has established this candidate's window. */
  proposedArrivalMinutes: number | null;
  proposedDepartureMinutes: number | null;
  /** Optional feasible trip interval before route ordering exists. */
  feasibleWindow?: {
    earliestArrivalMinutes: number;
    latestDepartureMinutes: number;
    dwellMinutes: number;
  };
}

function parseTimeRanges(value: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const pattern = /(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)\s*(?:~|～|-|–|—)\s*([01]?\d|2[0-3]):([0-5]\d)(?=\D|$)/g;
  for (const match of value.matchAll(pattern)) {
    ranges.push({
      start: Number(match[1]) * 60 + Number(match[2]),
      end: Number(match[3]) * 60 + Number(match[4]),
    });
  }
  return ranges;
}

function feasibleScheduleStatus(
  detail: TourPlaceScheduleDetail,
  input: NonNullable<ScheduleCompatibilityInput["feasibleWindow"]>,
): "compatible" | "conflict" | "unknown" {
  const operating = detail.operatingInformation?.trim();
  if (!operating) return "unknown";
  const ranges = parseTimeRanges(operating);
  if (ranges.length === 0) return "unknown";
  const hasAmbiguousQualification =
    ranges.length !== 1 ||
    /(?:브레이크\s*타임|휴게\s*시간)/.test(operating) ||
    /(?:요일|주말|평일|공휴일|성수기|비수기|시즌|계절|입장\s*마감|마지막\s*입장|라스트\s*오더)/.test(
      operating,
    ) ||
    ranges.some(({ start, end }) => end < start) ||
    detail.sections.intro.status === "partial";
  if (hasAmbiguousQualification) return "unknown";
  const permitsSlot = ranges.some(({ start, end }) => {
    if (end < start) return false;
    const earliest = Math.max(start, input.earliestArrivalMinutes);
    const latest = Math.min(end, input.latestDepartureMinutes);
    return latest - earliest >= input.dwellMinutes;
  });
  return permitsSlot ? "compatible" : "conflict";
}

export function assessScheduleCompatibilityV1(
  input: ScheduleCompatibilityInput,
): ScheduleCompatibilityResult {
  if (!input.providerAvailable || !input.detail) {
    return {
      status: "provider_unavailable",
      reasonCodes: ["schedule_provider_unavailable"],
      warningCodes: [],
    };
  }
  if (input.detail.sections.intro.status === "unavailable") {
    return {
      status: "provider_unavailable",
      reasonCodes: ["schedule_intro_provider_unavailable"],
      warningCodes: [],
    };
  }
  if (input.detail.sections.intro.status === "partial") {
    return {
      status: "unknown",
      reasonCodes: [],
      warningCodes: [
        "operating_hours_conflicting_or_partial",
        UNKNOWN_OPERATING_HOURS_WARNING,
      ],
    };
  }
  const retrievedAt = Date.parse(input.detail.source.retrievedAt);
  const snapshot = Date.parse(input.asOf);
  const distanceFromSnapshot = Math.abs(snapshot - retrievedAt);
  if (
    !Number.isFinite(retrievedAt) ||
    !Number.isFinite(snapshot) ||
    distanceFromSnapshot > CANDIDATE_PIPELINE_V1_CONFIG.detailFreshnessMs
  ) {
    return {
      status: "unknown",
      reasonCodes: [],
      warningCodes: ["operating_hours_stale", UNKNOWN_OPERATING_HOURS_WARNING],
    };
  }
  if (input.feasibleWindow) {
    const explicitRestDay = assessOperatingHours({
      travelDate: input.travelDate,
      arrivalMinutes: input.feasibleWindow.earliestArrivalMinutes,
      departureMinutes:
        input.feasibleWindow.earliestArrivalMinutes +
        input.feasibleWindow.dwellMinutes,
      operatingInformation: null,
      restDayInformation: input.detail.restDayInformation,
    });
    if (explicitRestDay.status === "closed") {
      return {
        status: "conflict",
        reasonCodes: ["confirmed_schedule_conflict"],
        warningCodes: [],
      };
    }
    const status = feasibleScheduleStatus(input.detail, input.feasibleWindow);
    if (status === "conflict") {
      return {
        status,
        reasonCodes: ["confirmed_schedule_conflict"],
        warningCodes: [],
      };
    }
    if (status === "compatible") {
      return { status, reasonCodes: [], warningCodes: [] };
    }
    return {
      status: "unknown",
      reasonCodes: [],
      warningCodes: ["operating_hours_unknown", UNKNOWN_OPERATING_HOURS_WARNING],
    };
  }
  const hasExactWindow =
    input.proposedArrivalMinutes !== null &&
    input.proposedDepartureMinutes !== null;
  const result = assessOperatingHours({
    travelDate: input.travelDate,
    arrivalMinutes: input.proposedArrivalMinutes ?? 0,
    departureMinutes: input.proposedDepartureMinutes ?? 1,
    // Without a route order, only an explicit rest day can establish conflict.
    operatingInformation: hasExactWindow
      ? input.detail.operatingInformation
      : null,
    restDayInformation: input.detail.restDayInformation,
  });
  if (result.status === "closed") {
    return {
      status: "conflict",
      reasonCodes: ["confirmed_schedule_conflict"],
      warningCodes: [],
    };
  }
  if (result.status === "unknown" || !hasExactWindow) {
    return {
      status: "unknown",
      reasonCodes: [],
      warningCodes: ["operating_hours_unknown", UNKNOWN_OPERATING_HOURS_WARNING],
    };
  }
  return { status: "compatible", reasonCodes: [], warningCodes: [] };
}
