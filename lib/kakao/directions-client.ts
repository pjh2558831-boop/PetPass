import { z } from "zod";
import type { KakaoMapLocation } from "@/lib/kakao/maps";
import type {
  KakaoDirectionsRequest,
  KakaoDrivingRoute,
} from "@/types/kakao";

const drivingRouteSchema = z.object({
  totalDistanceMeters: z.number().nonnegative(),
  totalDurationSeconds: z.number().nonnegative(),
  taxiFareWon: z.number().nonnegative().optional(),
  tollFareWon: z.number().nonnegative().optional(),
  coordinates: z
    .array(
      z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      }),
    )
    .min(2),
  sections: z.array(
    z.object({
      distanceMeters: z.number().nonnegative(),
      durationSeconds: z.number().nonnegative(),
    }),
  ),
});

const routeResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    data: drivingRouteSchema,
    requestId: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({ message: z.string().min(1) }),
    requestId: z.string(),
  }),
]);

export function createDirectionsRequest(
  locations: KakaoMapLocation[],
): KakaoDirectionsRequest | null {
  if (locations.length < 2) return null;
  if (locations.length > 7) {
    throw new Error("길찾기는 출발지와 도착지를 포함해 최대 7곳까지 지원합니다.");
  }

  const points = locations.map((location) => {
    const coordinates = location.coordinates;
    if (
      !coordinates ||
      !Number.isFinite(coordinates.latitude) ||
      !Number.isFinite(coordinates.longitude)
    ) {
      throw new Error(`${location.name}의 좌표가 없어 길찾기를 할 수 없습니다.`);
    }
    return {
      name: location.name,
      x: coordinates.longitude,
      y: coordinates.latitude,
    };
  });

  return {
    origin: points[0],
    destination: points[points.length - 1],
    waypoints: points.slice(1, -1),
  };
}

export function getDirectionsRequestKey(request: KakaoDirectionsRequest): string {
  return JSON.stringify(request);
}

export function createDirectionsRequestLoader(fetchImpl: typeof fetch = fetch) {
  const inFlight = new Map<string, Promise<KakaoDrivingRoute>>();

  return (request: KakaoDirectionsRequest): Promise<KakaoDrivingRoute> => {
    const key = getDirectionsRequestKey(request);
    const existing = inFlight.get(key);
    if (existing) return existing;

    const pending = (async () => {
      const response = await fetchImpl("/api/kakao/directions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        cache: "no-store",
      });
      const parsed = routeResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new Error("길찾기 서버 응답 형식이 올바르지 않습니다.");
      }
      if (!parsed.data.ok) throw new Error(parsed.data.error.message);
      return parsed.data.data;
    })();

    inFlight.set(key, pending);
    void pending.finally(() => inFlight.delete(key)).catch(() => undefined);
    return pending;
  };
}

export const loadDrivingRoute = createDirectionsRequestLoader();

export function formatRouteDistance(meters: number): string {
  if (meters < 1_000) return `${Math.round(meters)}m`;
  return `${(meters / 1_000).toFixed(1)}km`;
}

export function formatRouteDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `약 ${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `약 ${hours}시간 ${remainder}분` : `약 ${hours}시간`;
}
