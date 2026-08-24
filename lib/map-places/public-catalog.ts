import "server-only";

import { z } from "zod";
import { createMapServiceSupabaseClient } from "@/lib/supabase/server";
import {
  getRegionConfig,
  type RegionId,
} from "@/lib/regions/config";
import {
  PUBLIC_MAP_PLACE_CATEGORIES,
  PUBLIC_MAP_PLACE_KINDS,
  PUBLIC_MAP_PLACE_PROVIDERS,
  PUBLIC_MAP_REVIEW_STATUSES,
  publicMapPlaceSchema,
  type PublicMapPlaceCategory,
  type PublicMapPlaceDTO,
  type PublicMapPlaceKind,
  type PublicMapPlacePage,
  type PublicMapPlaceProvider,
} from "@/types/public-map-place";

const publicCatalogRowSchema = z.object({
  id: z.number().int().positive(),
  provider: z.enum(PUBLIC_MAP_PLACE_PROVIDERS).default("kakao"),
  provider_place_id: z.string().min(1),
  name: z.string().min(1),
  candidate_kind: z.enum(PUBLIC_MAP_PLACE_KINDS),
  normalized_category: z.enum(PUBLIC_MAP_PLACE_CATEGORIES).nullable(),
  content_type_id: z.number().int().positive().nullable().default(null),
  district_code: z.string().min(1),
  district_name: z.string().min(1),
  address: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  phone: z.string().nullable(),
  image_url: z.string().url().nullable().default(null),
  place_url: z.string().url().nullable(),
  review_status: z.enum(PUBLIC_MAP_REVIEW_STATUSES),
  public_label: z.string().min(1),
  source: z.enum(["kakao_search_candidate", "kto_official"]),
  pet_access_verdict: z.enum(["allowed", "conditional", "not_allowed", "unknown"]).default("unknown"),
  pet_evidence_status: z.string().min(1).default("search_candidate"),
  category_group_code: z.string().nullable(),
  last_seen_at: z.string().min(1),
  matched_query_count: z.number().int().nonnegative(),
  category_query_agreement_count: z.number().int().nonnegative(),
  total_count: z.number().int().nonnegative(),
  has_more: z.boolean(),
});

export interface PublicMapCatalogQuery {
  regionId: RegionId;
  providers?: PublicMapPlaceProvider[];
  districtCodes?: string[];
  kinds?: PublicMapPlaceKind[];
  category?: PublicMapPlaceCategory;
  categories?: PublicMapPlaceCategory[];
  page: number;
  pageSize: number;
  afterId?: number;
}

type RpcPage = Awaited<ReturnType<typeof queryRpcPage>>;
type RpcPageInput = z.input<typeof publicCatalogRowSchema>[];

async function queryRpcPage(
  input: PublicMapCatalogQuery,
  afterId: number | null,
) {
  const supabase = createMapServiceSupabaseClient();
  const { data, error } = await supabase.rpc("get_public_map_catalog_by_region_v2", {
    p_region_id: input.regionId,
    p_providers: input.providers ?? [input.regionId === "jeju" ? "tour" : "kakao"],
    p_candidate_kinds: input.kinds,
    p_normalized_categories: input.categories ?? (input.category ? [input.category] : undefined),
    p_district_codes: input.districtCodes,
    p_after_id: afterId ?? undefined,
    p_result_limit: input.pageSize,
  });
  if (error) throw new Error("공개 지도 장소를 조회하지 못했습니다.");
  return publicCatalogRowSchema.array().parse(data ?? []);
}

export interface PublicCatalogRepositoryDependencies {
  queryPage?: (
    input: PublicMapCatalogQuery,
    afterId: number | null,
  ) => Promise<RpcPageInput>;
}

function toDto(
  row: z.infer<typeof publicCatalogRowSchema>,
  regionId: RegionId,
): PublicMapPlaceDTO {
  const provider = row.provider ?? "kakao";
  const contentTypeId = row.content_type_id == null
    ? null
    : String(row.content_type_id);
  const placeUrl = provider === "tour"
    ? `/places/${encodeURIComponent(row.provider_place_id)}?${new URLSearchParams({
        region: regionId,
        ...(contentTypeId ? { contentTypeId } : {}),
      })}`
    : row.place_url;
  return publicMapPlaceSchema.parse({
    id: `${provider}:${row.provider_place_id}`,
    provider,
    providerPlaceId: row.provider_place_id,
    name: row.name,
    kind: row.candidate_kind,
    category: row.normalized_category,
    district: { code: row.district_code, name: row.district_name },
    address: row.address,
    coordinates: { latitude: row.latitude, longitude: row.longitude },
    phone: row.phone?.trim() || null,
    imageUrl: row.image_url,
    contentTypeId,
    placeUrl,
    source: row.source,
    petAccessVerdict: row.pet_access_verdict,
    reviewStatus: row.review_status,
    publicLabel: row.public_label,
    categoryGroupCode: row.category_group_code,
    lastSeenAt: row.last_seen_at,
    matchedQueryCount: row.matched_query_count,
    categoryQueryAgreementCount: row.category_query_agreement_count,
  });
}

const locationRowSchema = z.object({
  provider_place_id: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export async function findPublicMapPlaceLocation(
  regionId: RegionId,
  providerPlaceId: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const supabase = createMapServiceSupabaseClient();
  const { data, error } = await supabase.rpc("get_public_map_place_location_by_region_v1", {
    p_region_id: regionId,
    p_provider_place_id: providerPlaceId,
  });
  if (error) throw new Error("공개 지도 장소 위치를 조회하지 못했습니다.");
  const parsed = locationRowSchema.array().parse(data ?? []);
  return parsed[0]
    ? { latitude: parsed[0].latitude, longitude: parsed[0].longitude }
    : null;
}

export async function queryPublicMapCatalog(
  input: PublicMapCatalogQuery,
  dependencies: PublicCatalogRepositoryDependencies = {},
): Promise<PublicMapPlacePage> {
  const queryPage = dependencies.queryPage ?? queryRpcPage;
  let afterId: number | null = input.afterId ?? null;
  let rows: RpcPage = [];

  const pagesToWalk = input.afterId === undefined ? input.page : 1;
  for (let currentPage = 1; currentPage <= pagesToWalk; currentPage += 1) {
    rows = publicCatalogRowSchema.array().parse(await queryPage(input, afterId));
    if (currentPage === pagesToWalk || rows.length === 0) break;
    afterId = rows.at(-1)?.id ?? null;
  }

  const totalCount = rows[0]?.total_count ?? 0;
  const region = getRegionConfig(input.regionId);
  return {
    region: { id: region.id, displayName: region.displayName },
    items: rows.map((row) => toDto(row, input.regionId)),
    page: input.page,
    pageSize: input.pageSize,
    totalCount,
    hasNext: rows.length > 0 && rows[0].has_more,
    nextCursor: rows.at(-1)?.id ?? null,
  };
}
