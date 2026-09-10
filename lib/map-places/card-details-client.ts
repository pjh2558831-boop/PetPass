import { z } from "zod";
import { MAP_PLACE_CARD_DETAILS_VERSION, MAP_PLACE_CARD_PAGE_SIZE, type MapPlaceCardDetailsPage } from "@/types/map-place-card-details";
import { MAP_PLACES_SNAPSHOT_DATASETS, type MapPlacesSnapshotDataset } from "@/types/map-places-snapshot";
import { REGION_IDS, type RegionId } from "@/types/region";

const pageSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    contractVersion: z.literal(MAP_PLACE_CARD_DETAILS_VERSION),
    region: z.enum(REGION_IDS),
    dataset: z.enum(MAP_PLACES_SNAPSHOT_DATASETS),
    publicationVersion: z.custom<MapPlaceCardDetailsPage["publicationVersion"]>((value) => typeof value === "string" && /^p1-.+/.test(value)),
    items: z.array(z.object({
      id: z.string(), address: z.string(), phone: z.string().nullable(),
      imageUrl: z.string().nullable(), placeUrl: z.string().nullable(), contentTypeId: z.string().nullable(),
    })).max(MAP_PLACE_CARD_PAGE_SIZE),
    page: z.literal(1), pageSize: z.literal(MAP_PLACE_CARD_PAGE_SIZE), totalCount: z.number().int().nonnegative(),
  }),
});
const recentPages = new Map<string, { value: MapPlaceCardDetailsPage; expiresAt: number }>();
const pendingPages = new Map<string, { controller: AbortController; consumers: number; promise: Promise<MapPlaceCardDetailsPage> }>();

export async function requestMapPlaceCardDetails(
  region: RegionId,
  dataset: MapPlacesSnapshotDataset,
  ids: readonly string[],
  signal: AbortSignal,
  publicationVersion?: string,
): Promise<MapPlaceCardDetailsPage> {
  signal.throwIfAborted();
  const params = new URLSearchParams({ version: "1", region, dataset, ids: [...ids].sort().join(",") });
  // Snapshot publication scopes this cache; card pages may hash a narrower provider set.
  const key = `${params}|${publicationVersion ?? ""}`;
  const cached = recentPages.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    recentPages.delete(key);
    recentPages.set(key, cached);
    return cached.value;
  }
  recentPages.delete(key);
  let pending = pendingPages.get(key);
  if (!pending) {
    const controller = new AbortController();
    const promise = (async () => {
      const response = await fetch(`/api/map/places/cards?${params}`, {
        signal: controller.signal, credentials: "omit", headers: { Accept: "application/json" },
      });
      const parsed = pageSchema.safeParse(await response.json());
      controller.signal.throwIfAborted();
      const data = parsed.success ? parsed.data.data : null;
      const responseIds = new Set(data?.items.map(({ id }) => id));
      if (!response.ok || !data || data.region !== region || data.dataset !== dataset ||
        data.items.length !== ids.length || data.totalCount !== ids.length ||
        responseIds.size !== ids.length || ids.some((id) => !responseIds.has(id))) {
        throw new Error("지도 장소 카드 정보를 확인하지 못했습니다.");
      }
      recentPages.set(key, { value: data, expiresAt: Date.now() + 60_000 });
      if (recentPages.size > 48) recentPages.delete(recentPages.keys().next().value!);
      return data;
    })().finally(() => {
      if (pendingPages.get(key)?.controller === controller) pendingPages.delete(key);
    });
    pending = { controller, consumers: 0, promise };
    pendingPages.set(key, pending);
  }
  const shared = pending;
  shared.consumers++;
  return new Promise((resolve, reject) => {
    let settled = false;
    function release() {
      if (settled) return false;
      settled = true;
      signal.removeEventListener("abort", abort);
      shared.consumers--;
      if (shared.consumers === 0 && pendingPages.get(key) === shared) {
        pendingPages.delete(key);
        shared.controller.abort();
      }
      return true;
    }
    function abort() { if (release()) reject(signal.reason); }
    signal.addEventListener("abort", abort, { once: true });
    shared.promise.then(
      (data) => { if (release()) resolve(data); },
      (error: unknown) => { if (release()) reject(error); },
    );
    if (signal.aborted) abort();
  });
}
