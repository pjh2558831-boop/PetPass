import { z } from "zod";
import { getRegionConfig } from "@/lib/regions/config";
import { apiFailure } from "@/lib/shared/api-response";
import {
  lightweightMapPlacesSnapshot,
  loadMapPlacesSnapshot,
} from "@/lib/map-places/snapshot";
import {
  MAP_PLACES_SNAPSHOT_SCOPES,
  MAP_PLACES_SNAPSHOT_DATASETS,
  MAP_PLACES_SNAPSHOT_VERSION,
  isMapPlacesSnapshot,
  type MapPlacesSnapshot,
  type MapPlacesSnapshotRequest,
} from "@/types/map-places-snapshot";
import { REGION_IDS } from "@/types/region";

const ALLOWED_PARAMETERS = new Set(["version", "region", "scope", "dataset"]);
const querySchema = z.object({
  version: z.coerce.number().int().pipe(z.literal(MAP_PLACES_SNAPSHOT_VERSION)),
  region: z.enum(REGION_IDS),
  scope: z.enum(MAP_PLACES_SNAPSHOT_SCOPES),
  dataset: z.enum(MAP_PLACES_SNAPSHOT_DATASETS),
});
const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, stale-while-revalidate=3600, stale-if-error=3600",
  "CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=86400, stale-if-error=3600",
  "Vercel-CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=86400, stale-if-error=3600",
} as const;
const SERIALIZED_SNAPSHOT_LIMIT = 40;
const serializedSnapshots = new Map<string, string>();

function serializedSnapshot(snapshot: MapPlacesSnapshot): string {
  const key = [
    snapshot.region,
    snapshot.dataset,
    snapshot.publicationVersion,
    snapshot.dataVersion,
    `freshness=${snapshot.freshness.status}`,
    `staleAt=${snapshot.freshness.staleAt ?? ""}`,
  ].join(":");
  const cached = serializedSnapshots.get(key);
  if (cached) return cached;
  const body = JSON.stringify({
    ok: true,
    data: lightweightMapPlacesSnapshot(snapshot),
    requestId: `map-snapshot-${snapshot.dataVersion}`,
  });
  serializedSnapshots.set(key, body);
  if (serializedSnapshots.size > SERIALIZED_SNAPSHOT_LIMIT) {
    const oldest = serializedSnapshots.keys().next().value as string | undefined;
    if (oldest) serializedSnapshots.delete(oldest);
  }
  return body;
}

type SnapshotLoader = (input: MapPlacesSnapshotRequest) => Promise<MapPlacesSnapshot>;

function parseRequest(request: Request): MapPlacesSnapshotRequest | null {
  if (request.headers.has("authorization")) return null;
  const params = new URL(request.url).searchParams;
  if ([...new Set(params.keys())].some((key) => !ALLOWED_PARAMETERS.has(key))) return null;
  if ([...new Set(params.keys())].some((key) => params.getAll(key).length !== 1)) return null;
  const parsed = querySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) return null;
  const region = getRegionConfig(parsed.data.region);
  return region?.mapEnabled && region.mapCatalog.snapshotDatasets.includes(parsed.data.dataset)
    ? parsed.data
    : null;
}

export function createMapPlacesSnapshotHandler({
  loadSnapshot = loadMapPlacesSnapshot,
}: {
  loadSnapshot?: SnapshotLoader;
} = {}) {
  return async function GET(request: Request): Promise<Response> {
    const input = parseRequest(request);
    if (!input) {
      return apiFailure(
        { code: "INVALID_REQUEST", message: "지도 스냅샷 요청을 확인해 주세요.", retryable: false },
        400,
        { "Cache-Control": "no-store" },
      );
    }
    try {
      const snapshot = await loadSnapshot(input);
      if (!isMapPlacesSnapshot(snapshot) || snapshot.region !== input.region || snapshot.contractVersion !== input.version || snapshot.scope !== input.scope || snapshot.dataset !== input.dataset) {
        throw new Error("Snapshot response does not match the request.");
      }
      const etag = `"${snapshot.dataVersion}"`;
      const headers = new Headers({
        ...PUBLIC_CACHE_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        ETag: etag,
        "X-PetPass-Region": input.region,
        "X-PetPass-Dataset": input.dataset,
        "X-PetPass-Publication": snapshot.publicationVersion,
        "X-PetPass-Snapshot-Freshness": snapshot.freshness.status,
      });
      if (request.headers.get("if-none-match") === etag) {
        return new Response(null, { status: 304, headers });
      }
      return new Response(serializedSnapshot(snapshot), { status: 200, headers });
    } catch {
      return apiFailure(
        { code: "UPSTREAM_ERROR", message: "지도 장소 스냅샷을 불러오지 못했습니다.", retryable: true },
        503,
        { "Cache-Control": "no-store" },
      );
    }
  };
}

export async function GET(request: Request): Promise<Response> {
  return createMapPlacesSnapshotHandler()(request);
}
