import "server-only";

import { z } from "zod";
import { createMapSupabaseClient } from "@/lib/supabase/server";
import {
  PUBLIC_MAP_PLACE_CATEGORIES,
  PUBLIC_MAP_PLACE_KINDS,
  PUBLIC_MAP_REVIEW_STATUSES,
  publicMapPlaceSchema,
  type PublicMapPlaceCategory,
  type PublicMapPlaceDTO,
  type PublicMapPlaceKind,
  type PublicMapPlacePage,
} from "@/types/public-map-place";

const publicCatalogRowSchema = z.object({
  id: z.number().int().positive(),
  provider_place_id: z.string().min(1),
  name: z.string().min(1),
  candidate_kind: z.enum(PUBLIC_MAP_PLACE_KINDS),
  normalized_category: z.enum(PUBLIC_MAP_PLACE_CATEGORIES).nullable(),
  district_code: z.string().min(1),
  district_name: z.string().min(1),
  address: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  phone: z.string().nullable(),
  place_url: z.string().url(),
  review_status: z.enum(PUBLIC_MAP_REVIEW_STATUSES),
  public_label: z.string().min(1),
  source: z.literal("kakao_search_candidate"),
  total_count: z.number().int().nonnegative(),
  has_more: z.boolean(),
});

export interface PublicMapCatalogQuery {
  districtCodes?: string[];
  kinds?: PublicMapPlaceKind[];
  category?: PublicMapPlaceCategory;
  page: number;
  pageSize: number;
}

type RpcPage = Awaited<ReturnType<typeof queryRpcPage>>;

async function queryRpcPage(
  input: PublicMapCatalogQuery,
  afterId: number | null,
) {
  const supabase = createMapSupabaseClient();
  const { data, error } = await supabase.rpc("get_public_map_catalog_v1", {
    p_candidate_kinds: input.kinds,
    p_normalized_categories: input.category ? [input.category] : undefined,
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
  ) => Promise<RpcPage>;
}

function toDto(row: z.infer<typeof publicCatalogRowSchema>): PublicMapPlaceDTO {
  return publicMapPlaceSchema.parse({
    id: `kakao:${row.provider_place_id}`,
    providerPlaceId: row.provider_place_id,
    name: row.name,
    kind: row.candidate_kind,
    category:
      row.candidate_kind === "pet_travel_candidate"
        ? row.normalized_category
        : null,
    district: { code: row.district_code, name: row.district_name },
    address: row.address,
    coordinates: { latitude: row.latitude, longitude: row.longitude },
    phone: row.phone?.trim() || null,
    placeUrl: row.place_url,
    source: row.source,
    reviewStatus: row.review_status,
    publicLabel: row.public_label,
  });
}

export async function queryPublicMapCatalog(
  input: PublicMapCatalogQuery,
  dependencies: PublicCatalogRepositoryDependencies = {},
): Promise<PublicMapPlacePage> {
  const queryPage = dependencies.queryPage ?? queryRpcPage;
  let afterId: number | null = null;
  let rows: RpcPage = [];

  for (let currentPage = 1; currentPage <= input.page; currentPage += 1) {
    rows = await queryPage(input, afterId);
    if (currentPage === input.page || rows.length === 0) break;
    afterId = rows.at(-1)?.id ?? null;
  }

  const totalCount = rows[0]?.total_count ?? 0;
  return {
    items: rows.map(toDto),
    page: input.page,
    pageSize: input.pageSize,
    totalCount,
    hasNext: rows.length > 0 && rows[0].has_more,
  };
}
