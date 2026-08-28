import { createHash } from "node:crypto";
import { z } from "zod";
import { getRegionConfig } from "@/lib/regions/config";
import { loadMapPlaceCardDetails } from "@/lib/map-places/card-details";
import { apiFailure } from "@/lib/shared/api-response";
import {
  MAP_PLACE_CARD_DETAILS_VERSION,
  MAP_PLACE_CARD_PAGE_SIZE,
  type MapPlaceCardDetailsPage,
  type MapPlaceCardDetailsRequest,
} from "@/types/map-place-card-details";
import { MAP_PLACES_SNAPSHOT_DATASETS } from "@/types/map-places-snapshot";
import { REGION_IDS } from "@/types/region";

const ALLOWED_PARAMETERS = new Set(["version", "region", "dataset", "ids"]);
const querySchema = z.object({
  version: z.coerce.number().int().pipe(z.literal(MAP_PLACE_CARD_DETAILS_VERSION)),
  region: z.enum(REGION_IDS),
  dataset: z.enum(MAP_PLACES_SNAPSHOT_DATASETS),
  ids: z.string().trim().min(1).max(2_048),
});
const STABLE_ID = /^(tour|kakao):[^,:]{1,200}$/u;
const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60, stale-while-revalidate=60, stale-if-error=3600",
  "CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=300, stale-if-error=3600",
  "Vercel-CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=300, stale-if-error=3600",
} as const;

type CardDetailsLoader = (input: MapPlaceCardDetailsRequest) => Promise<MapPlaceCardDetailsPage>;

function parseRequest(request: Request): MapPlaceCardDetailsRequest | null {
  if (request.headers.has("authorization")) return null;
  const params = new URL(request.url).searchParams;
  if ([...new Set(params.keys())].some((key) => !ALLOWED_PARAMETERS.has(key)) ||
    [...new Set(params.keys())].some((key) => params.getAll(key).length !== 1)) return null;
  const parsed = querySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) return null;
  const region = getRegionConfig(parsed.data.region);
  if (!region?.mapEnabled || !region.mapCatalog.snapshotDatasets.includes(parsed.data.dataset)) return null;
  const ids = parsed.data.ids.split(",");
  if (ids.length === 0 || ids.length > MAP_PLACE_CARD_PAGE_SIZE ||
    new Set(ids).size !== ids.length || ids.some((id) => !STABLE_ID.test(id))) return null;
  if (parsed.data.dataset === "shopping" && ids.some((id) => !id.startsWith("tour:"))) return null;
  return { region: parsed.data.region, dataset: parsed.data.dataset, ids };
}

export function createMapPlaceCardDetailsHandler({
  loadDetails = loadMapPlaceCardDetails,
}: { loadDetails?: CardDetailsLoader } = {}) {
  return async function GET(request: Request): Promise<Response> {
    const input = parseRequest(request);
    if (!input) return apiFailure(
      { code: "INVALID_REQUEST", message: "지도 장소 카드 요청을 확인해 주세요.", retryable: false },
      400,
      { "Cache-Control": "no-store" },
    );
    try {
      const page = await loadDetails(input);
      const responseIds = new Set(page.items.map(({ id }) => id));
      if (page.region !== input.region || page.dataset !== input.dataset ||
        page.items.length !== input.ids.length ||
        input.ids.some((id) => !responseIds.has(id))) {
        throw new Error("Card detail response does not match the request.");
      }
      const queryHash = createHash("sha256").update(input.ids.join(",")).digest("hex").slice(0, 12);
      const etag = `"${page.publicationVersion}-${queryHash}"`;
      const headers = new Headers({
        ...PUBLIC_CACHE_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        ETag: etag,
        "X-PetPass-Region": input.region,
        "X-PetPass-Dataset": input.dataset,
        "X-PetPass-Publication": page.publicationVersion,
      });
      if (request.headers.get("if-none-match") === etag) {
        return new Response(null, { status: 304, headers });
      }
      return new Response(JSON.stringify({
        ok: true,
        data: page,
        requestId: `map-cards-${page.publicationVersion}-${queryHash}`,
      }), { status: 200, headers });
    } catch {
      return apiFailure(
        { code: "UPSTREAM_ERROR", message: "지도 장소 카드 정보를 불러오지 못했습니다.", retryable: true },
        503,
        { "Cache-Control": "no-store" },
      );
    }
  };
}

export async function GET(request: Request): Promise<Response> {
  return createMapPlaceCardDetailsHandler()(request);
}
