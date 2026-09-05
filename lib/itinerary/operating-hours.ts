export const UNKNOWN_OPERATING_HOURS_WARNING = "운영시간 확인 필요" as const;

export interface OperatingHoursInput {
  travelDate: string;
  arrivalMinutes: number;
  departureMinutes: number;
  operatingInformation: string | null;
  restDayInformation: string | null;
  sourceDate?: string;
}

export interface OperatingHoursAssessment {
  status: "open" | "closed" | "unknown";
  warning: typeof UNKNOWN_OPERATING_HOURS_WARNING | null;
}

const KOREAN_WEEKDAYS = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
] as const;

function parseTimeRanges(value: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const pattern = /(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)\s*(?:~|～|-|–|—)\s*([01]?\d|2[0-3]):([0-5]\d)(?=\D|$)/g;
  for (const match of value.matchAll(pattern)) {
    const start = Number(match[1]) * 60 + Number(match[2]);
    const end = Number(match[3]) * 60 + Number(match[4]);
    ranges.push({ start, end });
  }
  return ranges;
}

function overlaps(
  arrival: number,
  departure: number,
  range: { start: number; end: number },
): boolean {
  return arrival < range.end && departure > range.start;
}

function containedBy(
  arrival: number,
  departure: number,
  range: { start: number; end: number },
): boolean {
  if (range.end >= range.start) {
    return arrival >= range.start && departure <= range.end;
  }
  return arrival >= range.start || departure <= range.end;
}

function isExplicitRestDay(travelDate: string, restDay: string, sourceDate?: string): boolean {
  if (/연중\s*무휴|휴무\s*없음|무휴/.test(restDay)) return false;
  if (/당일\s*(?:휴무|휴관)|오늘\s*(?:휴무|휴관)/.test(restDay)) return travelDate === sourceDate;
  // A weekday qualified by holiday exceptions or ordinal weeks is not every such weekday.
  if (/첫째|둘째|셋째|넷째|다섯째|\d\s*째|공휴일|제외|변경|문의/.test(restDay)) return false;
  const weekday = KOREAN_WEEKDAYS[
    new Date(`${travelDate}T00:00:00Z`).getUTCDay()
  ];
  return restDay.includes(weekday);
}

export function assessOperatingHours(
  input: OperatingHoursInput,
): OperatingHoursAssessment {
  const operating = input.operatingInformation?.trim() ?? "";
  const restDay = input.restDayInformation?.trim() ?? "";

  if (restDay && isExplicitRestDay(input.travelDate, restDay, input.sourceDate)) {
    return { status: "closed", warning: null };
  }

  if (!operating) {
    return { status: "unknown", warning: UNKNOWN_OPERATING_HOURS_WARNING };
  }
  if (/당일|오늘|첫째|둘째|셋째|넷째|공휴일|제외|변경|문의/.test(restDay) ||
      /요일|주말|평일|공휴일|성수기|비수기|계절/.test(operating)) {
    return { status: "unknown", warning: UNKNOWN_OPERATING_HOURS_WARNING };
  }

  const breakMatch = operating.match(
    /(?:브레이크\s*타임|휴게\s*시간)[^0-9]{0,12}([01]?\d|2[0-3]):[0-5]\d\s*(?:~|～|-|–|—)\s*([01]?\d|2[0-3]):[0-5]\d/,
  );
  if (breakMatch) {
    const breakRanges = parseTimeRanges(breakMatch[0]);
    if (
      breakRanges.some((range) =>
        overlaps(input.arrivalMinutes, input.departureMinutes, range),
      )
    ) {
      return { status: "closed", warning: null };
    }
    const openingRanges = parseTimeRanges(operating.replace(breakMatch[0], ""));
    if (openingRanges.length > 0) {
      return openingRanges.some((range) =>
        containedBy(input.arrivalMinutes, input.departureMinutes, range),
      )
        ? { status: "open", warning: null }
        : { status: "closed", warning: null };
    }
    return { status: "unknown", warning: UNKNOWN_OPERATING_HOURS_WARNING };
  }

  const ranges = parseTimeRanges(operating);

  if (ranges.length > 0) {
    return ranges.some((range) =>
      containedBy(input.arrivalMinutes, input.departureMinutes, range),
    )
      ? { status: "open", warning: null }
      : { status: "closed", warning: null };
  }

  if (
    !/연중\s*무휴/.test(operating) &&
    /(?:휴무|휴관|운영\s*안\s*함|영업\s*안\s*함)/.test(operating)
  ) {
    return { status: "closed", warning: null };
  }

  return { status: "unknown", warning: UNKNOWN_OPERATING_HOURS_WARNING };
}
