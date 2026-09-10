import type { PlaceCardImage } from "@/types/place-card-image";
import type { HomepagePlaceCard } from "@/types/homepage-places";
import type { RegionId } from "@/types/region";

export function resolveHomepageCardImage(
  place: Pick<HomepagePlaceCard, "id" | "name" | "category" | "imageUrl">,
  options: { regionId: RegionId; staticMapEnabled: boolean },
): PlaceCardImage {
  if (place.imageUrl) {
    return {
      kind: "provider_photo",
      src: place.imageUrl,
      alt: `${place.name} 제공 이미지`,
    };
  }
  if (options.staticMapEnabled && /^(?:kakao|tour):\d{1,128}$/u.test(place.id)) {
    return {
      kind: "static_map",
      src: `/api/places/${encodeURIComponent(place.id)}/location-thumbnail?region=${options.regionId}`,
      alt: "장소 위치 미리보기",
    };
  }
  return {
    kind: "category_placeholder",
    category: place.category,
    alt: `${place.name} 장소 사진 준비 중`,
  };
}

export function compareHomepageCardPhotos(
  left: Pick<HomepagePlaceCard, "imageUrl">,
  right: Pick<HomepagePlaceCard, "imageUrl">,
): number {
  return Number(Boolean(right.imageUrl)) - Number(Boolean(left.imageUrl));
}
