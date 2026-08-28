import "server-only";

import { z } from "zod";
import { getRegionConfig, getRegionDistrict } from "@/lib/regions/config";
import { publicMapPlaceMatchesRegion } from "@/lib/map-places/region-contract";
import { createMapServiceSupabaseClient } from "@/lib/supabase/server";
import { publicMapPlaceSchema, type PublicMapPlacePage } from "@/types/public-map-place";
import type { RegionId } from "@/types/region";

export const SHOPPING_CATALOG_BATCH_SIZE = 1_000;

const shoppingRowSchema = z.object({
  id: z.number().int().positive(),
  provider: z.literal("tour"),
  provider_place_id: z.string().min(1),
  name: z.string().min(1),
  content_type_id: z.number().int().positive(),
  district_code: z.string().min(1),
  district_name: z.string().min(1),
  road_address: z.string().nullable(),
  lot_address: z.string().nullable(),
  location: z.string().regex(/^[a-f0-9]+$/iu),
  phone: z.string().nullable(),
  image_url: z.string().url().nullable(),
  last_seen_at: z.string().min(1),
});

type ShoppingRow = z.infer<typeof shoppingRowSchema>;

function ewkbPoint(value: string): { latitude: number; longitude: number } {
  const bytes = Buffer.from(value, "hex");
  if (bytes.length < 25) throw new Error("Shopping catalog location is malformed.");
  const littleEndian = bytes.readUInt8(0) === 1;
  const readUInt32 = littleEndian
    ? (offset: number) => bytes.readUInt32LE(offset)
    : (offset: number) => bytes.readUInt32BE(offset);
  const readDouble = littleEndian
    ? (offset: number) => bytes.readDoubleLE(offset)
    : (offset: number) => bytes.readDoubleBE(offset);
  const geometryType = readUInt32(1);
  const hasSrid = (geometryType & 0x20000000) !== 0;
  if ((geometryType & 0xff) !== 1) throw new Error("Shopping catalog location is not a point.");
  const coordinateOffset = hasSrid ? 9 : 5;
  if (hasSrid && readUInt32(5) !== 4326) throw new Error("Shopping catalog location SRID is invalid.");
  const longitude = readDouble(coordinateOffset);
  const latitude = readDouble(coordinateOffset + 8);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Shopping catalog coordinates are invalid.");
  }
  return { latitude, longitude };
}

function toShoppingPlace(row: ShoppingRow, regionId: RegionId) {
  const region = getRegionConfig(regionId);
  const district = getRegionDistrict(region, row.district_code);
  if (!district || district.name !== row.district_name || row.content_type_id !== 38) {
    throw new Error("Shopping catalog row violates the regional contract.");
  }
  const place = publicMapPlaceSchema.parse({
    id: `tour:${row.provider_place_id}`,
    provider: "tour",
    providerPlaceId: row.provider_place_id,
    name: row.name,
    kind: "tourism_place",
    category: "shopping",
    district: { code: row.district_code, name: row.district_name },
    address: row.road_address?.trim() || row.lot_address?.trim() || "주소 확인 필요",
    coordinates: ewkbPoint(row.location),
    phone: row.phone?.trim() || null,
    imageUrl: row.image_url,
    contentTypeId: "38",
    placeUrl: null,
    source: "kto_official",
    petAccessVerdict: "unknown",
    reviewStatus: "needs_review",
    publicLabel: "반려동물 동반 정보 확인 필요",
    categoryGroupCode: null,
    lastSeenAt: row.last_seen_at,
    matchedQueryCount: 0,
    categoryQueryAgreementCount: 0,
  });
  if (!publicMapPlaceMatchesRegion(place, region)) {
    throw new Error("Shopping catalog row violates the regional contract.");
  }
  return place;
}

async function queryShoppingRows(
  regionId: RegionId,
  from: number,
  to: number,
  count: "exact" | undefined,
): Promise<{ rows: ShoppingRow[]; count: number | null }> {
  const supabase = createMapServiceSupabaseClient();
  const query = supabase
    .from("map_places")
    .select(
      "id,provider,provider_place_id,name,content_type_id,district_code,district_name,road_address,lot_address,location,phone,image_url,last_seen_at",
      count ? { count } : undefined,
    )
    .eq("region_id", regionId)
    .eq("catalog_dataset", "shopping")
    .eq("provider", "tour")
    .eq("is_active", true)
    .order("id", { ascending: true })
    .range(from, to);
  const { data, error, count: totalCount } = await query;
  if (error) throw new Error("공개 쇼핑 지도 장소를 조회하지 못했습니다.");
  return {
    rows: shoppingRowSchema.array().parse(data ?? []),
    count: totalCount,
  };
}

export async function queryPublicShoppingCatalogSnapshot(input: {
  regionId: RegionId;
  providers: ["tour"] | readonly ["tour"];
  kinds: readonly ["tourism_place"];
  categories: readonly ["shopping"];
  dataset: "shopping";
}): Promise<PublicMapPlacePage> {
  const region = getRegionConfig(input.regionId);
  if (!region.mapEnabled || !region.mapCatalog.snapshotDatasets.includes("shopping")) {
    throw new Error("Shopping catalog dataset is not enabled for the region.");
  }
  const first = await queryShoppingRows(
    input.regionId,
    0,
    SHOPPING_CATALOG_BATCH_SIZE - 1,
    "exact",
  );
  const totalCount = first.count ?? first.rows.length;
  const remainingPageCount = Math.max(0, Math.ceil(totalCount / SHOPPING_CATALOG_BATCH_SIZE) - 1);
  const remaining = await Promise.all(Array.from({ length: remainingPageCount }, (_, index) => {
    const from = (index + 1) * SHOPPING_CATALOG_BATCH_SIZE;
    return queryShoppingRows(
      input.regionId,
      from,
      Math.min(totalCount, from + SHOPPING_CATALOG_BATCH_SIZE) - 1,
      undefined,
    );
  }));
  const rows = [first, ...remaining].flatMap((page) => page.rows);
  if (rows.length !== totalCount || new Set(rows.map(({ id }) => id)).size !== totalCount) {
    throw new Error("Shopping catalog snapshot is incomplete or duplicated.");
  }
  return {
    region: { id: region.id, displayName: region.displayName },
    items: rows.map((row) => toShoppingPlace(row, input.regionId)),
    page: 1,
    pageSize: totalCount,
    totalCount,
    hasNext: false,
    nextCursor: rows.at(-1)?.id ?? null,
  };
}
