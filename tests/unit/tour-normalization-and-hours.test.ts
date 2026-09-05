import { describe, expect, it } from "vitest";
import { assessOperatingHours } from "@/lib/itinerary/operating-hours";
import { normalizeTourContentTypeId } from "@/lib/tour-api/normalizers";

describe("candidate normalization false negatives", () => {
  it("does not apply a source's today closure to another date or expand qualified weekdays", () => {
    const input = { travelDate: "2026-09-02", sourceDate: "2026-09-01", arrivalMinutes: 600, departureMinutes: 660, operatingInformation: "09:00-18:00", restDayInformation: "오늘 휴무" };
    expect(assessOperatingHours(input).status).toBe("unknown");
    expect(assessOperatingHours({ ...input, travelDate: input.sourceDate }).status).toBe("closed");
    expect(assessOperatingHours({ ...input, travelDate: "2026-09-08", restDayInformation: "첫째 화요일 휴무" }).status).toBe("unknown");
  });
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
