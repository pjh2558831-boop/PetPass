import "server-only";

import { z } from "zod";
import { getRegionConfig } from "@/lib/regions/config";
import {
  resolveMapCatalogPublicationVersion,
  type MapCatalogPublicationVersion,
} from "@/lib/map-places/publication-version";
import { createMapServiceSupabaseClient } from "@/lib/supabase/server";
import {
  MAP_PLACE_CARD_DETAILS_VERSION,
  MAP_PLACE_CARD_PAGE_SIZE,
  type MapPlaceCardDetailsAssemblyRequest,
  type MapPlaceCardDetailsPage,
  type MapPlaceCardDetailsRequest,
} from "@/types/map-place-card-details";
import type { PublicMapPlaceProvider } from "@/types/public-map-place";

const cardRowSchema = z.object({
  provider: z.enum(["tour", "kakao"]),
  provider_place_id: z.string().min(1),
  catalog_dataset: z.enum(["core", "shopping"]),
  road_address: z.string().nullable(),
  lot_address: z.string().nullable(),
  phone: z.string().nullable(),
  image_url: z.string().url().nullable(),
  source_url: z.string().url().nullable(),
  content_type_id: z.number().int().positive().nullable(),
  is_active: z.boolean(),
  public_visibility: z.boolean().nullable(),
  pending_publication_run_id: z.number().int().positive().nullable(),
  lifecycle_status: z.string().nullable(),
  review_status: z.string().nullable(),
});

export type MapPlaceCardRow = z.infer<typeof cardRowSchema>;
export type MapPlaceCardRowsQuery = (
  input: MapPlaceCardDetailsRequest,
) => Promise<MapPlaceCardRow[]>;
type PublicationResolver = (
  input: MapPlaceCardDetailsRequest,
) => Promise<MapCatalogPublicationVersion>;

function parseStableId(id: string): { provider: PublicMapPlaceProvider; providerPlaceId: string } {
  const separator = id.indexOf(":");
  const provider = id.slice(0, separator);
  const providerPlaceId = id.slice(separator + 1);
  if ((provider !== "tour" && provider !== "kakao") || !providerPlaceId) {
    throw new Error("Card detail place ID is invalid.");
  }
  return { provider, providerPlaceId };
}

function rowIsPublished(row: MapPlaceCardRow): boolean {
  if (!row.is_active) return false;
  if (row.provider === "tour") return true;
  return row.catalog_dataset === "core" &&
    row.public_visibility === true &&
    row.pending_publication_run_id === null &&
    (row.lifecycle_status === "current" ||
      (row.lifecycle_status === "stale" && row.review_status === "confirmed"));
}

export async function queryMapPlaceCardRows(
  input: MapPlaceCardDetailsRequest,
): Promise<MapPlaceCardRow[]> {
  const identities = input.ids.map(parseStableId);
  const providers = [...new Set(identities.map(({ provider }) => provider))];
  const providerPlaceIds = [...new Set(identities.map(({ providerPlaceId }) => providerPlaceId))];
  const supabase = createMapServiceSupabaseClient();
  const { data, error } = await supabase
    .from("map_places")
    .select(
      "provider,provider_place_id,catalog_dataset,road_address,lot_address,phone,image_url,source_url,content_type_id,is_active,public_visibility,pending_publication_run_id,lifecycle_status,review_status",
    )
    .eq("region_id", input.region)
    .eq("catalog_dataset", input.dataset)
    .eq("is_active", true)
    .in("provider", providers)
    .in("provider_place_id", providerPlaceIds);
  if (error) throw new Error("지도 장소 카드 정보를 조회하지 못했습니다.");
  return cardRowSchema.array().parse(data ?? []);
}

export async function assembleMapPlaceCardDetails(
  input: MapPlaceCardDetailsAssemblyRequest,
  { queryRows = queryMapPlaceCardRows }: { queryRows?: MapPlaceCardRowsQuery } = {},
): Promise<MapPlaceCardDetailsPage> {
  const region = getRegionConfig(input.region);
  if (!region.mapEnabled || !region.mapCatalog.snapshotDatasets.includes(input.dataset)) {
    throw new Error("Card detail dataset is not enabled for the region.");
  }
  if (input.ids.length === 0 || input.ids.length > MAP_PLACE_CARD_PAGE_SIZE ||
    new Set(input.ids).size !== input.ids.length) {
    throw new Error("Card detail request must contain one unique card page.");
  }
  const identities = new Map(input.ids.map((id) => {
    const identity = parseStableId(id);
    return [id, identity] as const;
  }));
  if ([...identities.values()].some(({ provider }) =>
    !region.allowedMapProviders.includes(provider))) {
    throw new Error("Card detail provider is not enabled for the region.");
  }
  if (input.dataset === "shopping" &&
    [...identities.values()].some(({ provider }) => provider !== "tour")) {
    throw new Error("Shopping card detail provider is invalid.");
  }
  const rows = await queryRows(input);
  const byId = new Map(rows.flatMap((row) => {
    const id = `${row.provider}:${row.provider_place_id}`;
    const expected = identities.get(id);
    if (!expected || row.catalog_dataset !== input.dataset || !rowIsPublished(row)) return [];
    return [[id, row] as const];
  }));
  const items = input.ids.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    const contentTypeId = row.content_type_id === null ? null : String(row.content_type_id);
    const placeUrl = row.provider === "kakao"
      ? row.source_url
      : input.dataset === "shopping"
        ? null
        : `/places/${encodeURIComponent(row.provider_place_id)}?${new URLSearchParams({
            region: input.region,
            ...(contentTypeId ? { contentTypeId } : {}),
          })}`;
    return [{
      id,
      address: row.road_address?.trim() || row.lot_address?.trim() || "주소 확인 필요",
      phone: row.phone?.trim() || null,
      imageUrl: row.image_url,
      placeUrl,
      contentTypeId,
    }];
  });
  return {
    contractVersion: MAP_PLACE_CARD_DETAILS_VERSION,
    region: input.region,
    dataset: input.dataset,
    publicationVersion: input.publicationVersion,
    items,
    page: 1,
    pageSize: MAP_PLACE_CARD_PAGE_SIZE,
    totalCount: items.length,
  };
}

interface CardCacheEntry {
  value?: MapPlaceCardDetailsPage;
  inFlight?: Promise<MapPlaceCardDetailsPage>;
}

export function createMapPlaceCardDetailsLoader({
  queryRows = queryMapPlaceCardRows,
  resolvePublicationVersion = (input) => resolveMapCatalogPublicationVersion({
    region: input.region,
    dataset: input.dataset,
    providers: [...new Set(input.ids.map((id) => parseStableId(id).provider))],
  }),
}: {
  queryRows?: MapPlaceCardRowsQuery;
  resolvePublicationVersion?: PublicationResolver;
} = {}) {
  const entries = new Map<string, CardCacheEntry>();
  const activePublication = new Map<string, MapCatalogPublicationVersion>();
  const publicationInFlight = new Map<string, Promise<MapCatalogPublicationVersion>>();
  return async (input: MapPlaceCardDetailsRequest): Promise<MapPlaceCardDetailsPage> => {
    const providers = [...new Set(input.ids.map((id) => parseStableId(id).provider))]
      .sort()
      .join(",");
    const base = `${input.region}:${input.dataset}:providers=${providers}:query=cards`;
    let pendingPublication = publicationInFlight.get(base);
    if (!pendingPublication) {
      pendingPublication = resolvePublicationVersion(input).finally(() => {
        if (publicationInFlight.get(base) === pendingPublication) publicationInFlight.delete(base);
      });
      publicationInFlight.set(base, pendingPublication);
    }
    const publicationVersion = await pendingPublication;
    const previousPublication = activePublication.get(base);
    if (previousPublication && previousPublication !== publicationVersion) {
      const prefix = `${base}:publication=${previousPublication}:`;
      for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
    }
    activePublication.set(base, publicationVersion);
    const key = `${base}:publication=${publicationVersion}:ids=${input.ids.join(",")}`;
    const entry = entries.get(key);
    if (entry?.value) return entry.value;
    if (entry?.inFlight) return entry.inFlight;
    const inFlight = assembleMapPlaceCardDetails(
      { ...input, publicationVersion },
      { queryRows },
    ).then((value) => {
      entries.set(key, { value });
      if (entries.size > 200) {
        const oldest = entries.keys().next().value as string | undefined;
        if (oldest) entries.delete(oldest);
      }
      return value;
    }).catch((error: unknown) => {
      entries.delete(key);
      throw error;
    });
    entries.set(key, { inFlight });
    return inFlight;
  };
}

export const loadMapPlaceCardDetails = createMapPlaceCardDetailsLoader();
