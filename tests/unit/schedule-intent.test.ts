import { describe, expect, it } from "vitest";
import { departureCandidates, seoulDate } from "@/lib/recommendation/schedule/schedule-intent";

describe("optional Asia/Seoul schedule", () => {
  it("keeps a clock preference and chooses the nearest same-day alternative, later on ties", () => {
    expect(departureCandidates({ date: "2026-09-12", startTime: "10:00" }, new Date("2026-09-05T00:00:00Z"), [570, 630]).slice(0, 3)).toEqual(["10:00", "10:30", "09:30"]);
  });
  it("prefers daytime but never proposes a past departure today", () => {
    expect(departureCandidates({ date: "2026-09-05", startTime: null }, new Date("2026-09-05T03:07:00Z"))[0]).toBe("12:15");
    expect(departureCandidates({ date: "2026-09-05", startTime: null }, new Date("2026-09-05T14:55:00Z"))).toEqual([]);
  });
  it("uses Korea's calendar through month/year boundaries without assigning an undated intent a date", () => {
    expect(seoulDate(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
    expect(seoulDate(new Date("2026-09-30T15:00:00Z"))).toBe("2026-10-01");
    expect(departureCandidates({ date: null, startTime: null }, new Date("2026-12-31T14:59:00Z"))[0]).toBe("09:00");
  });
});
