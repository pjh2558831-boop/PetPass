import { z } from "zod";
import { loadHomepageOptionalDataset } from "@/lib/homepage/homepage-optional";
import { createHomepageTimingRecorder } from "@/lib/homepage/performance-timing";
import { getHomepageCatalogDataset } from "@/lib/homepage/catalog-datasets";
import { getRegionConfig } from "@/lib/regions/config";
import { apiFailure, apiSuccess } from "@/lib/shared/api-response";
import {
  HOMEPAGE_OPTIONAL_VERSION,
  HOMEPAGE_STORED_OPTIONAL_DATASETS,
  type HomepageOptionalRequest,
  type HomepageOptionalSnapshot,
} from "@/types/homepage-optional";
import { REGION_IDS } from "@/types/region";

const ALLOWED_PARAMETERS = new Set(["version", "region", "scope", "dataset"]);
const querySchema = z.object({
  version: z.coerce.number().int().pipe(z.literal(HOMEPAGE_OPTIONAL_VERSION)),
  region: z.enum(REGION_IDS),
  scope: z.literal("optional"),
  dataset: z.enum(HOMEPAGE_STORED_OPTIONAL_DATASETS),
});
const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60, stale-while-revalidate=60",
  "CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=300",
  "Vercel-CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=300",
} as const;

type OptionalLoader = (
  input: HomepageOptionalRequest,
  observeTiming?: Parameters<typeof loadHomepageOptionalDataset>[1],
) => Promise<HomepageOptionalSnapshot>;

function parseRequest(request: Request): HomepageOptionalRequest | null {
  if (request.headers.has("authorization") || request.headers.has("cookie")) return null;
  const params = new URL(request.url).searchParams;
  if ([...new Set(params.keys())].some((key) => !ALLOWED_PARAMETERS.has(key))) return null;
  if ([...new Set(params.keys())].some((key) => params.getAll(key).length !== 1)) return null;
  const parsed = querySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) return null;
  const region = getRegionConfig(parsed.data.region);
  const descriptor = region ? getHomepageCatalogDataset(region, parsed.data.dataset) : null;
  if (!region?.mapEnabled || !descriptor || descriptor.scope !== "optional") return null;
  return parsed.data;
}

export function createHomepageOptionalHandler({
  loadOptional = loadHomepageOptionalDataset,
}: { loadOptional?: OptionalLoader } = {}) {
  return async function GET(request: Request): Promise<Response> {
    const timing = createHomepageTimingRecorder();
    const withTiming = (response: Response): Response => {
      response.headers.set("Server-Timing", timing.finish());
      return response;
    };
    const input = parseRequest(request);
    if (!input) return withTiming(apiFailure(
      { code: "INVALID_REQUEST", message: "선택 장소 데이터 요청을 확인해 주세요.", retryable: false },
      400,
      { "Cache-Control": "no-store" },
    ));
    try {
      const snapshot = await loadOptional(input, timing.observe);
      if (snapshot.region !== input.region || snapshot.dataset !== input.dataset) {
        throw new Error("Optional response mismatch.");
      }
      const serializationStartedAt = timing.now();
      const response = apiSuccess(snapshot, 200, PUBLIC_CACHE_HEADERS);
      timing.observe({ name: "serialize", durationMs: timing.now() - serializationStartedAt });
      return withTiming(response);
    } catch {
      return withTiming(apiFailure(
        { code: "UPSTREAM_ERROR", message: "선택한 장소 데이터를 불러오지 못했습니다.", retryable: true },
        503,
        { "Cache-Control": "no-store" },
      ));
    }
  };
}

export async function GET(request: Request): Promise<Response> {
  return createHomepageOptionalHandler()(request);
}
