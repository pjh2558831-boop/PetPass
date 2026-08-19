import { mapCatalogPlaceToCategory } from "@/lib/map-places/place-categories";
import type { PlaceCardImage } from "@/types/place-card-image";
import type { PublicCatalogPlace } from "@/types/public-catalog-place";

export function resolvePlaceCardImage(
  place: Pick<PublicCatalogPlace, "id" | "name" | "layer" | "category" | "categoryGroupCode" | "imageUrl" | "approvedImageUrl" | "coordinates">,
  options: { staticMapEnabled: boolean },
): PlaceCardImage {
  if (place.layer === "tourism" && place.imageUrl) {
    return { kind: "provider_photo", src: place.imageUrl, alt: `${place.name} 제공 이미지` };
  }
  if (place.approvedImageUrl) {
    return { kind: "approved_upload", src: place.approvedImageUrl, alt: `${place.name} 승인 이미지` };
  }
  if (options.staticMapEnabled && place.layer !== "tourism" && place.coordinates) {
    return {
      kind: "static_map",
      src: `/api/places/${encodeURIComponent(place.id)}/location-thumbnail`,
      alt: "장소 위치 미리보기",
    };
  }
  return {
    kind: "category_placeholder",
    category: mapCatalogPlaceToCategory(place),
    alt: `${place.name} 장소 사진 준비 중`,
  };
}
