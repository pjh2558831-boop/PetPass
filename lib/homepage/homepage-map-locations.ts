import type { KakaoMapLocation, KakaoMapMarkerKind } from "@/lib/kakao/maps";
import type {
  HomepageMapMarker,
  HomepagePlaceLayer,
} from "@/types/homepage-places";

const MARKER_KIND: Record<HomepagePlaceLayer, KakaoMapMarkerKind> = {
  official: "tourism-official",
  kakao_candidate: "kakao-candidate",
  veterinary: "veterinary",
  pet_shop: "pet-shop",
};

const MARKER_LABEL: Record<HomepagePlaceLayer, string> = {
  official: "공",
  kakao_candidate: "K",
  veterinary: "+",
  pet_shop: "샵",
};

export function createHomepageMapLocations(
  markers: readonly HomepageMapMarker[],
): KakaoMapLocation[] {
  const seenIds = new Set<string>();
  return markers.flatMap((marker) => {
    if (
      seenIds.has(marker.id) ||
      !Number.isFinite(marker.coordinates.latitude) ||
      !Number.isFinite(marker.coordinates.longitude) ||
      marker.coordinates.latitude < -90 ||
      marker.coordinates.latitude > 90 ||
      marker.coordinates.longitude < -180 ||
      marker.coordinates.longitude > 180
    ) {
      return [];
    }
    seenIds.add(marker.id);
    return [
      {
        id: marker.id,
        name: marker.name,
        address: marker.address,
        coordinates: marker.coordinates,
        markerKind: MARKER_KIND[marker.layer],
        markerLabel: MARKER_LABEL[marker.layer],
        sourceLabel: marker.sourceLabel,
        interactive: true,
        clusterable: true,
      },
    ];
  });
}
