import { BUSAN_REGION_CONFIG } from "@/lib/regions/config";
import type { TablesInsert } from "@/types/database";
import type { KakaoDiscoveryCandidate, KakaoDiscoveryCategory } from "@/types/kakao";

export type MapPlaceInsert = TablesInsert<"map_places">;

function districtFor(address: string) {
  return (
    BUSAN_REGION_CONFIG.districts.find(({ name }) => address.includes(name)) ??
    null
  );
}

export function normalizeKakaoMapPlace(
  candidate: KakaoDiscoveryCandidate,
  category: KakaoDiscoveryCategory,
  retrievedAt: string,
): MapPlaceInsert {
  const district = districtFor(candidate.address);
  return {
    region_id: BUSAN_REGION_CONFIG.id,
    provider: "kakao",
    provider_place_id: candidate.id,
    name: candidate.name,
    category_group: category,
    category_code: candidate.kakaoCategoryText || null,
    content_type_id: null,
    road_address: candidate.address || null,
    lot_address: candidate.address || null,
    district_code: district?.legalDongDistrictCode ?? null,
    district_name: district?.name ?? null,
    location: `POINT(${candidate.coordinates.longitude} ${candidate.coordinates.latitude})`,
    phone: candidate.phone ?? null,
    image_url: null,
    source_url: candidate.placeUrl ?? null,
    provider_visibility: "not_applicable",
    pet_evidence_status: "search_candidate",
    pet_evidence: {
      source: "Kakao Local keyword search",
      verification_required: true,
      retrieved_at: retrievedAt,
    },
    pet_notes: "카카오 검색 후보 · 방문 전 동반 가능 여부 확인",
    is_active: true,
    last_seen_at: retrievedAt,
    fetched_at: retrievedAt,
    expires_at: new Date(Date.parse(retrievedAt) + 24 * 60 * 60 * 1_000).toISOString(),
    updated_at: retrievedAt,
  };
}

export function deduplicateKakaoMapPlaces(
  rows: MapPlaceInsert[],
): MapPlaceInsert[] {
  const unique = new Map<string, MapPlaceInsert>();
  for (const row of rows) {
    const key = `${row.provider}:${row.provider_place_id}`;
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
}
