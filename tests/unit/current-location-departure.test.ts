import { describe, expect, it } from "vitest";
import {
  currentLocationDeparture,
  currentLocationErrorMessage,
} from "@/components/planner/current-location-departure";

describe("current location departure", () => {
  it("preserves the browser coordinates and labels their source truthfully", () => {
    expect(
      currentLocationDeparture({
        latitude: 35.1795543,
        longitude: 129.0756416,
      }),
    ).toEqual({
      label: "내 위치",
      source: "current_location",
      coordinates: {
        latitude: 35.1795543,
        longitude: 129.0756416,
      },
    });
  });

  it.each([
    [1, "위치 권한이 필요해요. 브라우저 설정에서 위치 접근을 허용해 주세요."],
    [2, "현재 위치를 확인하지 못했어요. 잠시 후 다시 시도하거나 장소를 검색해 주세요."],
    [3, "현재 위치 확인 시간이 초과됐어요. 잠시 후 다시 시도하거나 장소를 검색해 주세요."],
  ])("maps geolocation error code %s to an actionable message", (code, message) => {
    expect(currentLocationErrorMessage(code)).toBe(message);
  });
});
