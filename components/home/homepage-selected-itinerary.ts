import type { SelectedItineraryPlace } from "@/lib/storage/selected-itinerary-storage";
import type { HomepageInitialMarkerV1 } from "@/types/homepage-initial";
import type { HomepageMapMarker } from "@/types/homepage-places";
import type { PublicMapPlaceCategory } from "@/types/public-map-place";
import type { RegionId } from "@/types/region";

export function selectedItineraryPlaceFromHomepageTuple(
  tuple: HomepageInitialMarkerV1,
  regionId: RegionId,
): SelectedItineraryPlace | null {
  const [id, name, layer, category, , , , petAccessVerdict, publicLabel] = tuple;
  if (layer !== "tourism" && layer !== "kakao") {
    return null;
  }
  const separator = id.indexOf(":");
  const providerPlaceId = separator >= 0 ? id.slice(separator + 1) : "";
  if (!providerPlaceId) return null;
  return {
    id,
    regionId,
    providerPlaceId,
    name,
    layer,
    category: category as PublicMapPlaceCategory,
    sourceLabel: layer === "tourism" ? "한국관광공사" : "카카오 검색 후보",
    publicLabel,
    petAccessVerdict,
    imageUrl: null,
  };
}

export function mergeHomepageSelectionMetadata(
  current: ReadonlyMap<string, SelectedItineraryPlace>,
  tuples: readonly HomepageInitialMarkerV1[],
  regionId: RegionId,
): Map<string, SelectedItineraryPlace> {
  const next = new Map(current);
  for (const tuple of tuples) {
    const place = selectedItineraryPlaceFromHomepageTuple(tuple, regionId);
    if (place) next.set(place.id, place);
  }
  return next;
}

export function homepageSelectionCandidates(
  metadata: ReadonlyMap<string, SelectedItineraryPlace>,
  markers: readonly HomepageMapMarker[],
): Map<string, SelectedItineraryPlace> {
  return new Map(markers.flatMap((marker) => {
    const place = metadata.get(marker.id);
    return place ? [[marker.id, { ...place, imageUrl: marker.imageUrl } as SelectedItineraryPlace] as const] : [];
  }));
}
