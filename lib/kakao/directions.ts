import "server-only";

import { z } from "zod";
import { getKakaoRestApiKey } from "@/lib/kakao/server-config";
import { ProviderResponseError } from "@/lib/shared/errors";
import type {
  KakaoDirectionsRequest,
  KakaoDrivingRoute,
} from "@/types/kakao";

const roadSchema = z.object({
  vertexes: z.array(z.number().finite()),
});

const sectionSchema = z.object({
  distance: z.number().nonnegative(),
  duration: z.number().nonnegative(),
  roads: z.array(roadSchema).default([]),
});

const routeSchema = z.object({
  result_code: z.number(),
  summary: z
    .object({
      distance: z.number().nonnegative(),
      duration: z.number().nonnegative(),
      fare: z
        .object({
          taxi: z.number().nonnegative().optional(),
          toll: z.number().nonnegative().optional(),
        })
        .optional(),
    })
    .optional(),
  sections: z.array(sectionSchema).default([]),
});

const directionsResponseSchema = z.object({
  routes: z.array(routeSchema).min(1),
});

interface DirectionsProviderOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

function serializePoint(point: KakaoDirectionsRequest["origin"]): string {
  return `${point.x},${point.y},name=${point.name}`;
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }
  return error.name === "AbortError" || error.name === "TimeoutError";
}

function normalizeRoute(
  route: z.infer<typeof routeSchema>,
): KakaoDrivingRoute {
  if (route.result_code !== 0 || !route.summary) {
    throw new ProviderResponseError(
      "카카오모빌리티에서 이용 가능한 경로를 찾지 못했습니다.",
    );
  }

  const coordinates = route.sections.flatMap((section) =>
    section.roads.flatMap((road) => {
      if (road.vertexes.length % 2 !== 0) {
        throw new ProviderResponseError(
          "카카오모빌리티 경로 좌표 응답 형식이 올바르지 않습니다.",
        );
      }

      const points = [];
      for (let index = 0; index < road.vertexes.length; index += 2) {
        points.push({
          longitude: road.vertexes[index],
          latitude: road.vertexes[index + 1],
        });
      }
      return points;
    }),
  );

  if (coordinates.length < 2) {
    throw new ProviderResponseError(
      "카카오모빌리티 경로 좌표가 충분하지 않습니다.",
    );
  }

  return {
    totalDistanceMeters: route.summary.distance,
    totalDurationSeconds: route.summary.duration,
    taxiFareWon: route.summary.fare?.taxi,
    tollFareWon: route.summary.fare?.toll,
    coordinates,
    sections: route.sections.map((section) => ({
      distanceMeters: section.distance,
      durationSeconds: section.duration,
    })),
  };
}

export async function getDirections(
  request: KakaoDirectionsRequest,
  options: DirectionsProviderOptions = {},
): Promise<KakaoDrivingRoute> {
  const key = options.apiKey ?? getKakaoRestApiKey();
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = new URL("https://apis-navi.kakaomobility.com/v1/directions");
  url.searchParams.set("origin", serializePoint(request.origin));
  url.searchParams.set("destination", serializePoint(request.destination));
  if (request.waypoints.length > 0) {
    url.searchParams.set(
      "waypoints",
      request.waypoints.map(serializePoint).join("|"),
    );
  }
  url.searchParams.set("priority", "RECOMMEND");
  url.searchParams.set("alternatives", "false");
  url.searchParams.set("road_details", "false");
  url.searchParams.set("summary", "false");

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new ProviderResponseError(
      isAbortError(error)
        ? "카카오모빌리티 길찾기 요청 시간이 초과되었습니다."
        : "카카오모빌리티 길찾기 요청에 연결하지 못했습니다.",
    );
  }

  if (!response.ok) {
    throw new ProviderResponseError(
      `카카오모빌리티 길찾기 요청이 ${response.status} 상태로 실패했습니다.`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderResponseError(
      "카카오모빌리티 길찾기 응답을 해석하지 못했습니다.",
    );
  }

  const parsed = directionsResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ProviderResponseError(
      "카카오모빌리티 길찾기 응답 형식이 올바르지 않습니다.",
    );
  }

  return normalizeRoute(parsed.data.routes[0]);
}
