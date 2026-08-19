import type { PlaceCategory } from "@/lib/map-places/place-categories";

export type PlaceCardImage =
  | { kind: "provider_photo"; src: string; alt: string }
  | { kind: "approved_upload"; src: string; alt: string }
  | { kind: "static_map"; src: string; alt: "장소 위치 미리보기" }
  | { kind: "category_placeholder"; category: PlaceCategory; alt: string };
