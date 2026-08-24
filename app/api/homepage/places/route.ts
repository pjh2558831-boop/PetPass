import { apiFailure, apiSuccess } from "@/lib/shared/api-response";
import {
  consumeRateLimit,
  getRequestClientId,
  rateLimitHeaders,
} from "@/lib/shared/rate-limit";
import { tourProviderErrorResponse } from "@/lib/tour-api/errors";
import { getDefaultTourService, type TourPlaceService } from "@/lib/tour-api/service";
import {
  collectHomepagePlacesSnapshot,
  type HomepagePlacesDependencies,
} from "@/lib/homepage/homepage-places";
import type { HomepagePlacesSnapshot } from "@/types/homepage-places";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60, stale-while-revalidate=60",
  "CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=300",
  "Vercel-CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=300",
} as const;

type SnapshotLoader = (
  dependencies: HomepagePlacesDependencies,
) => Promise<HomepagePlacesSnapshot>;

export interface HomepagePlacesHandlerDependencies {
  service: TourPlaceService;
  now?: () => Date;
  rateLimit?: typeof consumeRateLimit;
  loadSnapshot?: SnapshotLoader;
  cacheNow?: () => number;
  cacheFreshMs?: number;
  cacheStaleIfErrorMs?: number;
}

interface SnapshotCacheEntry {
  value?: HomepagePlacesSnapshot;
  storedAt?: number;
  inFlight?: Promise<HomepagePlacesSnapshot>;
  retryAfter?: number;
}

function createCachedSnapshotLoader({
  loadSnapshot,
  cacheNow,
  freshMs,
  staleIfErrorMs,
}: {
  loadSnapshot: SnapshotLoader;
  cacheNow: () => number;
  freshMs: number;
  staleIfErrorMs: number;
}): SnapshotLoader {
  const entries = new Map<string, SnapshotCacheEntry>();
  return async (dependencies) => {
    const key = dependencies.includeOptional ? "optional" : "default";
    const entry = entries.get(key) ?? {};
    const age = entry.storedAt === undefined
      ? Number.POSITIVE_INFINITY
      : cacheNow() - entry.storedAt;
    if (entry.value && age <= freshMs) return entry.value;
    if (entry.value && entry.retryAfter !== undefined && entry.retryAfter > cacheNow()) {
      return entry.value;
    }
    if (entry.inFlight) return entry.inFlight;
    const inFlight = loadSnapshot(dependencies).then((value) => {
      entries.set(key, { value, storedAt: cacheNow() });
      return value;
    }).catch((error: unknown) => {
      if (entry.value && age <= freshMs + staleIfErrorMs) {
        entries.set(key, {
          value: entry.value,
          storedAt: entry.storedAt,
          retryAfter: cacheNow() + Math.min(freshMs, 60_000),
        });
        return entry.value;
      }
      entries.delete(key);
      throw error;
    });
    entries.set(key, { ...entry, inFlight });
    return inFlight;
  };
}

export function createHomepagePlacesHandler({
  service,
  now = () => new Date(),
  rateLimit = consumeRateLimit,
  loadSnapshot = collectHomepagePlacesSnapshot,
  cacheNow = Date.now,
  cacheFreshMs = 300_000,
  cacheStaleIfErrorMs = 3_600_000,
}: HomepagePlacesHandlerDependencies) {
  const loadCachedSnapshot = createCachedSnapshotLoader({
    loadSnapshot,
    cacheNow,
    freshMs: cacheFreshMs,
    staleIfErrorMs: cacheStaleIfErrorMs,
  });
  return async function GET(request: Request): Promise<Response> {
    const limit = rateLimit("homepage-places", getRequestClientId(request), {
      limit: 30,
      windowMs: 60_000,
    });
    if (!limit.allowed) {
      return apiFailure(
        {
          code: "RATE_LIMITED",
          message: "잠시 후 홈페이지 장소 정보를 다시 요청해 주세요.",
          retryable: true,
        },
        429,
        { ...NO_STORE_HEADERS, ...rateLimitHeaders(limit) },
      );
    }
    const params = new URL(request.url).searchParams;
    const includeOptional = params.get("includeOptional") === "true";
    if ([...params.keys()].some((key) => key !== "includeOptional") ||
      params.getAll("includeOptional").length > 1 ||
      (params.has("includeOptional") && !includeOptional)) {
      return apiFailure(
        {
          code: "INVALID_REQUEST",
          message: "홈페이지 장소 정보 요청에는 쿼리 매개변수를 사용할 수 없습니다.",
          retryable: false,
        },
        400,
        NO_STORE_HEADERS,
      );
    }

    try {
      return apiSuccess(
        await loadCachedSnapshot({ service, now, includeOptional }),
        200,
        PUBLIC_CACHE_HEADERS,
      );
    } catch (error) {
      const response = tourProviderErrorResponse(error);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
  };
}

let defaultHomepagePlacesHandler: ReturnType<typeof createHomepagePlacesHandler> | null = null;

export async function GET(request: Request): Promise<Response> {
  defaultHomepagePlacesHandler ??= createHomepagePlacesHandler({
    service: getDefaultTourService(),
  });
  return defaultHomepagePlacesHandler(request);
}
