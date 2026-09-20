import type { TripPace } from "@/types/pet";

export interface TripPaceConfig {
  id: TripPace;
  label: string;
  rangeLabel: string;
  description: string;
  icon: string;
  minStops: number;
  maxStops: number;
  desiredStopCount: number;
}

export const TRIP_PACE_CONFIG = {
  relaxed: {
    id: "relaxed",
    label: "여유롭게",
    rangeLabel: "1~2곳",
    description: "이동과 휴식에 여유 있는 일정",
    icon: "🌿",
    minStops: 1,
    maxStops: 2,
    desiredStopCount: 2,
  },
  balanced: {
    id: "balanced",
    label: "적당히",
    rangeLabel: "3~4곳",
    description: "여행과 이동의 균형을 맞춘 일정",
    icon: "🐾",
    minStops: 3,
    maxStops: 4,
    desiredStopCount: 3,
  },
  packed: {
    id: "packed",
    label: "알차게",
    rangeLabel: "5곳",
    description: "가능한 여러 장소를 둘러보는 일정",
    icon: "✨",
    minStops: 5,
    maxStops: 5,
    desiredStopCount: 5,
  },
} as const satisfies Record<TripPace, TripPaceConfig>;

export const TRIP_PACE_OPTIONS = Object.values(TRIP_PACE_CONFIG);

export function getTripPaceConfig(pace: TripPace): TripPaceConfig {
  return TRIP_PACE_CONFIG[pace];
}

export function getTripPacePlanning(pace: TripPace): {
  desiredStopCount: number;
} {
  return { desiredStopCount: getTripPaceConfig(pace).desiredStopCount };
}
