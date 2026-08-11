import "server-only";

import { mapPlaceListSchema, type MapPlace, type MapPlaceCategory, type MapPlaceProvider } from "@/types/map-place";
import { createMapSupabaseClient } from "@/lib/supabase/server";

export interface MapPlaceBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface MapPlaceQuery extends MapPlaceBounds {
  providers?: MapPlaceProvider[];
  categories?: MapPlaceCategory[];
  limit: number;
}

export async function queryMapPlaces(input: MapPlaceQuery): Promise<MapPlace[]> {
  const supabase = createMapSupabaseClient();
  const { data, error } = await supabase.rpc("get_map_places_in_bounds", {
    p_south: input.south,
    p_west: input.west,
    p_north: input.north,
    p_east: input.east,
    p_providers: input.providers,
    p_categories: input.categories,
    p_result_limit: input.limit,
  });

  if (error) {
    throw new Error("저장된 지도 장소를 조회하지 못했습니다.");
  }
  return mapPlaceListSchema.parse(data ?? []);
}
