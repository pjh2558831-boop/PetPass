import { z } from "zod";
import { getRegionConfig } from "@/lib/regions/config";
import { apiFailure, apiSuccess } from "@/lib/shared/api-response";
import { createHomepageTimingRecorder } from "@/lib/homepage/performance-timing";
import { loadHomepageInitialPlaces } from "@/lib/homepage/homepage-initial";
import {
  HOMEPAGE_INITIAL_PROVIDER_SELECTIONS,
  HOMEPAGE_INITIAL_SCOPES,
  HOMEPAGE_INITIAL_VERSION,
  type HomepageInitialPlacesRequest,
  type HomepageInitialPlacesSnapshot,
} from "@/types/homepage-initial";
import { REGION_IDS } from "@/types/region";

const ALLOWED_PARAMETERS = new Set(["version", "region", "scope", "providers"]);
const querySchema = z.object({
  version: z.coerce.number().int().pipe(z.literal(HOMEPAGE_INITIAL_VERSION)),
  region: z.enum(REGION_IDS),
  scope: z.enum(HOMEPAGE_INITIAL_SCOPES),
  providers: z.enum(HOMEPAGE_INITIAL_PROVIDER_SELECTIONS),
});
const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60, stale-while-revalidate=60",
  "CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=300",
  "Vercel-CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=300",
} as const;
const DEGRADED_PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=5, stale-while-revalidate=10",
  "CDN-Cache-Control": "public, max-age=30, stale-while-revalidate=30",
  "Vercel-CDN-Cache-Control": "public, max-age=30, stale-while-revalidate=30",
} as const;

type InitialLoader = (
  input: HomepageInitialPlacesRequest,
  observeTiming?: Parameters<typeof loadHomepageInitialPlaces>[1],
) => Promise<HomepageInitialPlacesSnapshot>;

function parseRequest(request: Request): HomepageInitialPlacesRequest | null {
  if (request.headers.has("authorization")) return null;
  const params = new URL(request.url).searchParams;
  if ([...new Set(params.keys())].some((key) => !ALLOWED_PARAMETERS.has(key))) return null;
  if ([...new Set(params.keys())].some((key) => params.getAll(key).length !== 1)) return null;
  const parsed = querySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) return null;
  const region = getRegionConfig(parsed.data.region);
  if (!region?.mapEnabled) return null;
  if (parsed.data.scope === "optional" && (
    !region.kakaoDiscoveryEnabled || parsed.data.providers === "tour"
  )) return null;
  if (parsed.data.region === "jeju" && parsed.data.providers === "kakao") return null;
  return parsed.data;
}

export function createHomepageInitialPlacesHandler({
  loadInitial = loadHomepageInitialPlaces,
}: {
  loadInitial?: InitialLoader;
} = {}) {
  return async function GET(request: Request): Promise<Response> {
    const timing = createHomepageTimingRecorder();
    const withTiming = (response: Response): Response => {
      response.headers.set("Server-Timing", timing.finish());
      return response;
    };
    const input = parseRequest(request);
    if (!input) {
      return withTiming(apiFailure(
        { code: "INVALID_REQUEST", message: "홈페이지 초기 장소 요청을 확인해 주세요.", retryable: false },
        400,
        { "Cache-Control": "no-store" },
      ));
    }
    try {
      const snapshot = await loadInitial(input, timing.observe);
      if (
        snapshot.contractVersion !== input.version ||
        snapshot.region !== input.region ||
        snapshot.scope !== input.scope ||
        snapshot.providers !== input.providers
      ) throw new Error("Homepage initial response does not match the request.");
      const serializationStartedAt = timing.now();
      const degraded = Object.values(snapshot.layers).some(
        ({ state }) => state === "unavailable",
      );
      const response = apiSuccess(
        snapshot,
        200,
        degraded ? DEGRADED_PUBLIC_CACHE_HEADERS : PUBLIC_CACHE_HEADERS,
      );
      timing.observe({ name: "serialize", durationMs: timing.now() - serializationStartedAt });
      return withTiming(response);
    } catch {
      return withTiming(apiFailure(
        { code: "UPSTREAM_ERROR", message: "홈페이지 장소 지도를 불러오지 못했습니다.", retryable: true },
        503,
        { "Cache-Control": "no-store" },
      ));
    }
  };
}

export async function GET(request: Request): Promise<Response> {
  return createHomepageInitialPlacesHandler()(request);
}
