import type { Coordinates } from "@/types/place";
import type { ResolvedDeparture } from "@/types/pet";

export function currentLocationDeparture(
  coordinates: Coordinates,
): ResolvedDeparture {
  const { latitude, longitude } = coordinates;
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new TypeError("현재 위치 좌표를 확인할 수 없습니다.");
  }

  return {
    label: "내 위치",
    source: "current_location",
    coordinates: { latitude, longitude },
  };
}

export function currentLocationErrorMessage(code: number): string {
  if (code === 1) {
    return "위치 권한이 필요해요. 브라우저 설정에서 위치 접근을 허용해 주세요.";
  }
  if (code === 3) {
    return "현재 위치 확인 시간이 초과됐어요. 잠시 후 다시 시도하거나 장소를 검색해 주세요.";
  }
  return "현재 위치를 확인하지 못했어요. 잠시 후 다시 시도하거나 장소를 검색해 주세요.";
}
