import { z } from "zod";
import type { RegionId } from "@/types/region";

export const PUBLIC_MAP_PLACE_KINDS = [
  "tourism_place",
  "pet_travel_candidate",
  "veterinary",
  "pet_shop",
] as const;

export const PUBLIC_MAP_PLACE_PROVIDERS = ["tour", "kakao"] as const;
export const PUBLIC_MAP_PET_ACCESS_VERDICTS = [
  "allowed",
  "conditional",
  "not_allowed",
  "unknown",
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
export type PublicMapPlaceProvider = (typeof PUBLIC_MAP_PLACE_PROVIDERS)[number];
export type PublicMapPetAccessVerdict = (typeof PUBLIC_MAP_PET_ACCESS_VERDICTS)[number];

export const publicMapPlaceSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(PUBLIC_MAP_PLACE_PROVIDERS).default("kakao"),
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
  imageUrl: z.string().url().nullable().default(null),
  contentTypeId: z.string().regex(/^[0-9]+$/u).nullable().default(null),
  placeUrl: z.union([z.string().url(), z.string().startsWith("/")]).nullable(),
  source: z.enum(["kakao_search_candidate", "kto_official"]),
  petAccessVerdict: z.enum(PUBLIC_MAP_PET_ACCESS_VERDICTS).default("unknown"),
  reviewStatus: z.enum(PUBLIC_MAP_REVIEW_STATUSES),
  publicLabel: z.string().min(1),
  categoryGroupCode: z.string().min(1).nullable().default(null),
  lastSeenAt: z.string().datetime({ offset: true }).nullable().default(null),
  matchedQueryCount: z.number().int().nonnegative().default(0),
  categoryQueryAgreementCount: z.number().int().nonnegative().default(0),
});

export type PublicMapPlaceDTO = z.input<typeof publicMapPlaceSchema>;

export interface PublicMapPlacePage {
  region: {
    id: RegionId;
    displayName: string;
  };
  items: PublicMapPlaceDTO[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasNext: boolean;
  /** Opaque database cursor for the next page. Older API fixtures may omit it. */
  nextCursor?: number | null;
}
