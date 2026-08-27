import { z } from "zod";
import { loadHomepageCompletion } from "@/lib/homepage/homepage-completion";
import { createHomepageTimingRecorder } from "@/lib/homepage/performance-timing";
import { getHomepageCatalogDatasets } from "@/lib/homepage/catalog-datasets";
import { getRegionConfig } from "@/lib/regions/config";
import { apiFailure, apiSuccess } from "@/lib/shared/api-response";
import {
  HOMEPAGE_COMPLETION_DATASET,
  HOMEPAGE_COMPLETION_VERSION,
  isHomepageDatasetContinuation,
  type HomepageCompletionRequest,
  type HomepageCompletionSnapshot,
} from "@/types/homepage-completion";
import { REGION_IDS } from "@/types/region";

const ALLOWED_PARAMETERS = new Set([
  "version", "region", "scope", "dataset", "base", "generation", "continuations",
]);
const querySchema = z.object({
  version: z.coerce.number().int().pipe(z.literal(HOMEPAGE_COMPLETION_VERSION)),
  region: z.enum(REGION_IDS),
  scope: z.literal("default"),
  dataset: z.literal(HOMEPAGE_COMPLETION_DATASET),
  base: z.string().regex(/^v1-[a-f0-9]{16}$/u),
  generation: z.string().regex(/^g1-[a-f0-9]{16}$/u),
  continuations: z.string().min(2).max(4_096),
});

const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60, stale-while-revalidate=60",
  "CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=300",
  "Vercel-CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=300",
} as const;
const PARTIAL_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=5, stale-while-revalidate=10",
  "CDN-Cache-Control": "public, max-age=30, stale-while-revalidate=30",
  "Vercel-CDN-Cache-Control": "public, max-age=30, stale-while-revalidate=30",
} as const;

type CompletionLoader = (
  input: HomepageCompletionRequest,
  observeTiming?: Parameters<typeof loadHomepageCompletion>[1],
) => Promise<HomepageCompletionSnapshot>;

function parseRequest(request: Request): HomepageCompletionRequest | null {
  if (request.headers.has("authorization") || request.headers.has("cookie")) return null;
  const params = new URL(request.url).searchParams;
  if ([...new Set(params.keys())].some((key) => !ALLOWED_PARAMETERS.has(key))) return null;
  if ([...new Set(params.keys())].some((key) => params.getAll(key).length !== 1)) return null;
  const parsed = querySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) return null;
  const region = getRegionConfig(parsed.data.region);
  if (!region?.mapEnabled) return null;
  let continuations: unknown;
  try {
    continuations = JSON.parse(parsed.data.continuations);
  } catch {
    return null;
  }
  if (!Array.isArray(continuations) || continuations.length === 0 ||
    !continuations.every((entry) => isHomepageDatasetContinuation(entry, parsed.data.region)) ||
    continuations.some((entry) => entry.generationId !== parsed.data.generation) ||
    new Set(continuations.map((entry) => entry.datasetId)).size !== continuations.length) return null;
  const allowed = new Set(getHomepageCatalogDatasets(region, "default").map(({ id }) => id));
  if (continuations.some(({ datasetId }) => !allowed.has(datasetId))) return null;
  return {
    version: parsed.data.version,
    region: parsed.data.region,
    scope: parsed.data.scope,
    dataset: parsed.data.dataset,
    baseDataVersion: parsed.data.base,
    generationId: parsed.data.generation,
    continuations,
  };
}

export function createHomepageCompletionHandler({
  loadCompletion = loadHomepageCompletion,
}: { loadCompletion?: CompletionLoader } = {}) {
  return async function GET(request: Request): Promise<Response> {
    const timing = createHomepageTimingRecorder();
    const withTiming = (response: Response): Response => {
      response.headers.set("Server-Timing", timing.finish());
      return response;
    };
    const input = parseRequest(request);
    if (!input) return withTiming(apiFailure(
      { code: "INVALID_REQUEST", message: "홈페이지 완료 요청을 확인해 주세요.", retryable: false },
      400,
      { "Cache-Control": "no-store" },
    ));
    try {
      const snapshot = await loadCompletion(input, timing.observe);
      if (snapshot.region !== input.region || snapshot.baseDataVersion !== input.baseDataVersion ||
        snapshot.generationId !== input.generationId) throw new Error("Completion response mismatch.");
      const serializationStartedAt = timing.now();
      const response = apiSuccess(snapshot, 200, snapshot.complete ? PUBLIC_CACHE_HEADERS : PARTIAL_CACHE_HEADERS);
      timing.observe({ name: "serialize", durationMs: timing.now() - serializationStartedAt });
      return withTiming(response);
    } catch {
      return withTiming(apiFailure(
        { code: "UPSTREAM_ERROR", message: "나머지 지도 장소를 불러오지 못했습니다.", retryable: true },
        503,
        { "Cache-Control": "no-store" },
      ));
    }
  };
}

export async function GET(request: Request): Promise<Response> {
  return createHomepageCompletionHandler()(request);
}
