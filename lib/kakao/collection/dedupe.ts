import type { KakaoPlaceSearchResult } from "@/types/kakao";

export interface KakaoDeduplicationResult<T> {
  places: T[];
  duplicateCount: number;
}

function deduplicate<T>(
  places: readonly T[],
  placeId: (place: T) => string,
): KakaoDeduplicationResult<T> {
  const unique = new Map<string, T>();
  for (const place of places) {
    const id = placeId(place).trim();
    if (id && !unique.has(id)) unique.set(id, place);
  }
  return {
    places: [...unique.values()],
    duplicateCount: places.length - unique.size,
  };
}

export function deduplicateKakaoSearchResults<T extends KakaoPlaceSearchResult>(
  places: readonly T[],
): KakaoDeduplicationResult<T> {
  return deduplicate(places, ({ id }) => id);
}

export function deduplicateKakaoCandidateRecords<
  T extends { kakaoPlaceId: string },
>(places: readonly T[]): KakaoDeduplicationResult<T> {
  return deduplicate(places, ({ kakaoPlaceId }) => kakaoPlaceId);
}
