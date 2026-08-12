import { z } from "zod";

export const MAP_PLACE_PROVIDERS = ["tour", "kakao"] as const;
export const MAP_PLACE_CATEGORIES = [
  "attraction",
  "culture",
  "festival",
  "leisure",
  "accommodation",
  "food",
  "shopping",
] as const;

export type MapPlaceProvider = (typeof MAP_PLACE_PROVIDERS)[number];
export type MapPlaceCategory = (typeof MAP_PLACE_CATEGORIES)[number];

export const MAP_PLACE_PROVIDER_VISIBILITIES = [
  "exposed",
  "not_exposed",
  "unknown",
  "provider_unavailable",
  "not_applicable",
] as const;

export const mapPlaceSchema = z.object({
  id: z.number().int().positive(),
  provider: z.enum(MAP_PLACE_PROVIDERS),
  provider_place_id: z.string().min(1),
  name: z.string().min(1),
  category_group: z.enum(MAP_PLACE_CATEGORIES).nullable(),
  category_code: z.string().nullable(),
  content_type_id: z.number().int().nullable(),
  road_address: z.string().nullable(),
  lot_address: z.string().nullable(),
  district_name: z.string().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  phone: z.string().nullable(),
  image_url: z.string().nullable(),
  source_url: z.string().nullable(),
  provider_visibility: z.enum(MAP_PLACE_PROVIDER_VISIBILITIES),
  pet_evidence_status: z.enum([
    "official_verified",
    "official_unknown",
    "search_candidate",
  ]),
  pet_evidence: z.record(z.unknown()),
  pet_notes: z.string().nullable(),
  fetched_at: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }).nullable(),
});

export const mapPlaceListSchema = z.array(mapPlaceSchema);
export type MapPlace = z.infer<typeof mapPlaceSchema>;
