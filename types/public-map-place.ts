import { z } from "zod";

export const PUBLIC_MAP_PLACE_KINDS = [
  "pet_travel_candidate",
  "veterinary",
  "pet_shop",
] as const;

export const PUBLIC_MAP_PLACE_CATEGORIES = [
  "cafe",
  "food",
  "accommodation",
  "attraction",
  "park_walk",
  "leisure",
  "camping",
  "shopping",
  "other",
] as const;

export const PUBLIC_MAP_REVIEW_STATUSES = [
  "unreviewed",
  "confirmed",
  "needs_review",
] as const;

export type PublicMapPlaceKind = (typeof PUBLIC_MAP_PLACE_KINDS)[number];
export type PublicMapPlaceCategory = (typeof PUBLIC_MAP_PLACE_CATEGORIES)[number];

export const publicMapPlaceSchema = z.object({
  id: z.string().min(1),
  providerPlaceId: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(PUBLIC_MAP_PLACE_KINDS),
  category: z.enum(PUBLIC_MAP_PLACE_CATEGORIES).nullable(),
  district: z.object({ code: z.string().min(1), name: z.string().min(1) }),
  address: z.string().min(1),
  coordinates: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  phone: z.string().min(1).nullable(),
  placeUrl: z.string().url(),
  source: z.literal("kakao_search_candidate"),
  reviewStatus: z.enum(PUBLIC_MAP_REVIEW_STATUSES),
  publicLabel: z.string().min(1),
  categoryGroupCode: z.string().min(1).nullable().default(null),
  lastSeenAt: z.string().datetime({ offset: true }).nullable().default(null),
  matchedQueryCount: z.number().int().nonnegative().default(0),
  categoryQueryAgreementCount: z.number().int().nonnegative().default(0),
});

export type PublicMapPlaceDTO = z.input<typeof publicMapPlaceSchema>;

export interface PublicMapPlacePage {
  items: PublicMapPlaceDTO[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasNext: boolean;
  /** Opaque database cursor for the next page. Older API fixtures may omit it. */
  nextCursor?: number | null;
}
