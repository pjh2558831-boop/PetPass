import { z } from "zod";
import { apiFailure, apiSuccess } from "@/lib/shared/api-response";
import { createHomepageTimingRecorder } from "@/lib/homepage/performance-timing";
import { loadHomepageEnrichment } from "@/lib/homepage/homepage-enrichment";
import {
  HOMEPAGE_ENRICHMENT_SCOPE,
  HOMEPAGE_ENRICHMENT_VERSION,
  type HomepageEnrichmentSnapshot,
} from "@/types/homepage-enrichment";

const ALLOWED_PARAMETERS = new Set(["version", "region", "scope"]);
const querySchema = z.object({
  version: z.coerce.number().int().pipe(z.literal(HOMEPAGE_ENRICHMENT_VERSION)),
  region: z.literal("busan"),
  scope: z.literal(HOMEPAGE_ENRICHMENT_SCOPE),
});
const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60, stale-while-revalidate=60",
  "CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=300",
  "Vercel-CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=300",
} as const;

type EnrichmentLoader = (
  observeTiming?: Parameters<typeof loadHomepageEnrichment>[0],
) => Promise<HomepageEnrichmentSnapshot>;

function isValidRequest(request: Request): boolean {
  if (request.headers.has("authorization")) return false;
  const params = new URL(request.url).searchParams;
  if ([...new Set(params.keys())].some((key) => !ALLOWED_PARAMETERS.has(key))) return false;
  if ([...new Set(params.keys())].some((key) => params.getAll(key).length !== 1)) return false;
  return querySchema.safeParse(Object.fromEntries(params)).success;
}

export function createHomepageEnrichmentHandler({
  loadEnrichment = loadHomepageEnrichment,
}: {
  loadEnrichment?: EnrichmentLoader;
} = {}) {
  return async function GET(request: Request): Promise<Response> {
    const timing = createHomepageTimingRecorder();
    const withTiming = (response: Response): Response => {
      response.headers.set("Server-Timing", timing.finish());
      return response;
    };
    if (!isValidRequest(request)) {
      return withTiming(apiFailure(
        { code: "INVALID_REQUEST", message: "홈페이지 상세 보강 요청을 확인해 주세요.", retryable: false },
        400,
        { "Cache-Control": "no-store" },
      ));
    }
    try {
      const snapshot = await loadEnrichment(timing.observe);
      const serializationStartedAt = timing.now();
      const response = apiSuccess(snapshot, 200, PUBLIC_CACHE_HEADERS);
      timing.observe({ name: "serialize", durationMs: timing.now() - serializationStartedAt });
      return withTiming(response);
    } catch {
      return withTiming(apiFailure(
        { code: "UPSTREAM_ERROR", message: "공식 장소 상세 정보를 보강하지 못했습니다.", retryable: true },
        503,
        { "Cache-Control": "no-store" },
      ));
    }
  };
}

export async function GET(request: Request): Promise<Response> {
  return createHomepageEnrichmentHandler()(request);
}
