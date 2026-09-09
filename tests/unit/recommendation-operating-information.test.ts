import { expect, it, vi } from "vitest";
import { attachRouteOperatingInformation } from "@/lib/recommendation/v2/operating-information";
import type { RecommendedRouteStopV1 } from "@/types/recommendation";
import type { TourPlaceScheduleDetail } from "@/lib/tour-api/service";

it("displays provider hours without changing timing, deduplicates requests and skips Shopping/Kakao", async () => {
  const stop = (placeId: string, category = "attraction", source = "tourism_service2") => ({
    placeId, category, source, arrivalAt: "2026-09-08T01:00:21Z", departureAt: "2026-09-08T02:00:21Z",
  }) as RecommendedRouteStopV1;
  const stops = [stop("tour:1"), stop("tour:2", "shopping"), stop("kakao:3", "food", "kakao_catalog"), stop("tour:4")];
  const duplicate = stop("tour:1");
  const getPlaceScheduleDetail = vi.fn(async (id: string) => {
    if (id === "4") throw new Error("provider unavailable");
    return { operatingInformation: "09:00–09:30", restDayInformation: "매주 화요일 휴무", source: { retrievedAt: "2026-09-08T00:00:00Z" } } as TourPlaceScheduleDetail;
  });
  await attachRouteOperatingInformation([{ stops }, { stops: [duplicate] }], { getPlaceScheduleDetail });
  expect(getPlaceScheduleDetail.mock.calls.map(([id]) => id).sort()).toEqual(["1", "4"]);
  expect(stops[0]).toMatchObject({ operatingInformation: "09:00–09:30", restDayInformation: "매주 화요일 휴무", arrivalAt: "2026-09-08T01:00:21Z", departureAt: "2026-09-08T02:00:21Z" });
  expect(duplicate.operatingInformation).toBe("09:00–09:30");
  expect(stops.slice(1).map(s => s.operatingInformation)).toEqual([null, null, null]);
});

it("bounds optional enrichment to 2.5 seconds, keeps completed data, and ignores late results", async () => {
  vi.useFakeTimers();
  try {
    const stops = [1, 2, 3, 4].map(id => ({ placeId: `tour:${id}`, source: "tourism_service2", category: "attraction" }) as RecommendedRouteStopV1);
    let resolveLate!: (detail: TourPlaceScheduleDetail) => void;
    const late = new Promise<TourPlaceScheduleDetail>(resolve => { resolveLate = resolve; });
    const detail = { operatingInformation: "10:00–18:00", restDayInformation: "월요일", source: { retrievedAt: "2026-09-08T00:00:00Z" } } as TourPlaceScheduleDetail;
    const getPlaceScheduleDetail = vi.fn((id: string) => id === "1" ? Promise.resolve(detail) : late);
    let completed = false;
    const task = attachRouteOperatingInformation([{ stops }], { getPlaceScheduleDetail }).then(() => { completed = true; });
    await vi.advanceTimersByTimeAsync(2_500);
    expect(completed).toBe(true);
    expect(stops[0]?.operatingInformation).toBe("10:00–18:00");
    expect(stops[1]?.operatingInformation).toBeNull();
    resolveLate(detail);
    await task;
    await vi.advanceTimersByTimeAsync(1);
    expect(stops[1]?.operatingInformation).toBeNull();
    expect(getPlaceScheduleDetail.mock.calls.map(([id]) => id)).toEqual(["1", "2", "3"]);
  } finally {
    vi.useRealTimers();
  }
});
