import { describe, expect, it } from "vitest";
import { assessOperatingHours } from "@/lib/itinerary/operating-hours";
import { normalizeTourContentTypeId } from "@/lib/tour-api/normalizers";

describe("candidate normalization false negatives", () => {
  it("normalizes harmless provider whitespace without relabeling unknown content types", () => {
    expect(normalizeTourContentTypeId(" 39 ")).toBe("39");
    expect(normalizeTourContentTypeId("039")).toBeNull();
  });

  it("evaluates Korean rest weekdays from the requested calendar date", () => {
    expect(assessOperatingHours({
      travelDate: "2026-09-01",
      arrivalMinutes: 10 * 60,
      departureMinutes: 11 * 60,
      operatingInformation: "09:00-18:00",
      restDayInformation: "매주 화요일 휴무",
    })).toEqual({ status: "closed", warning: null });
    expect(assessOperatingHours({
      travelDate: "2026-09-02",
      arrivalMinutes: 10 * 60,
      departureMinutes: 11 * 60,
      operatingInformation: "09:00-18:00",
      restDayInformation: "매주 화요일 휴무",
    })).toEqual({ status: "open", warning: null });
  });
});
