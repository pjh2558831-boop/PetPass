import "server-only";

import { deriveRegionLabel } from "@/lib/regions/label";
import { TOUR_CATEGORY_LABELS } from "@/lib/shared/format";
import { collectTourHomepageSnapshot } from "@/lib/tour-api/homepage-catalog";
import type { PublicMapCatalogQuery } from "@/lib/map-places/public-catalog";
import { queryCachedHomepagePublicCatalog } from "@/lib/homepage/public-catalog-cache";
import type { TourPlaceService } from "@/lib/tour-api/service";
import type {
  HomepageLayerSnapshot,
  HomepageMapMarker,
  HomepagePlaceCard,
  HomepagePlaceLayer,
  HomepagePlacesSnapshot,
} from "@/types/homepage-places";
import type { TourHomepageSnapshot } from "@/types/homepage";
import type { TourPlaceCategory, TourPlaceSummary } from "@/types/place";
import type {
  PublicMapPlaceDTO,
  PublicMapPlaceKind,
  PublicMapPlacePage,
} from "@/types/public-map-place";

const PUBLIC_LAYER_KINDS = [
  "pet_travel_candidate",
  "veterinary",
  "pet_shop",
] as const satisfies readonly PublicMapPlaceKind[];

const CATEGORY_ORDER: readonly TourPlaceCategory[] = [
  "attraction",
  "culture",
  "festival",
  "leisure",
  "accommodation",
  "food",
  "shopping",
  "transportation",
  "unknown",
];

const PUBLIC_CATEGORY_LABELS = {
  cafe: "카페",
  food: "음식점",
  accommodation: "숙박",
  attraction: "관광·문화",
  park_walk: "공원·산책",
  leisure: "레저",
  camping: "캠핑",
  other: "기타",
} as const;

const PUBLIC_LAYER_CONFIG: Record<
  PublicMapPlaceKind,
  {
    layer: Exclude<HomepagePlaceLayer, "official">;
    sourceLabel: string;
    statusLabel: string;
    warning: string | null;
    enabledByDefault: boolean;
  }
> = {
  pet_travel_candidate: {
    layer: "kakao_candidate",
    sourceLabel: "카카오 검색 후보",
    statusLabel: "동반 여부 확인 필요",
    warning:
      "카카오 검색 후보입니다. 방문 전 반려동물 동반 가능 여부를 확인해 주세요.",
    enabledByDefault: true,
  },
  veterinary: {
    layer: "veterinary",
    sourceLabel: "동물병원",
    statusLabel: "진료 시간 확인 필요",
    warning: "운영 시간과 진료 가능 여부는 방문 전 확인해 주세요.",
    enabledByDefault: false,
  },
  pet_shop: {
    layer: "pet_shop",
    sourceLabel: "펫샵·용품점",
    statusLabel: "운영 정보 확인 필요",
    warning: "취급 품목과 운영 시간은 방문 전 확인해 주세요.",
    enabledByDefault: false,
  },
};

type PublicCatalogLoader = (
  input: PublicMapCatalogQuery,
) => Promise<PublicMapPlacePage>;

export interface HomepagePlacesDependencies {
  service: TourPlaceService;
  now?: () => Date;
  collectOfficial?: (input: {
    service: TourPlaceService;
    now?: () => Date;
  }) => Promise<TourHomepageSnapshot>;
  queryPublicCatalog?: PublicCatalogLoader;
}

function hasCoordinates(place: TourPlaceSummary): place is TourPlaceSummary & {
  latitude: number;
  longitude: number;
} {
  return Boolean(
    place.latitude !== null &&
      place.longitude !== null &&
      Number.isFinite(place.latitude) &&
      Number.isFinite(place.longitude) &&
      place.latitude >= -90 &&
      place.latitude <= 90 &&
      place.longitude >= -180 &&
      place.longitude <= 180,
  );
}

function tourHref(place: TourPlaceSummary): string {
  const query = place.contentTypeId
    ? `?contentTypeId=${encodeURIComponent(place.contentTypeId)}`
    : "";
  return `/places/${encodeURIComponent(place.contentId)}${query}`;
}

function tourDistrict(place: TourPlaceSummary): string | null {
  return deriveRegionLabel({
    regionCode: place.legalRegionCode,
    districtCode: place.legalDistrictCode,
    roadAddress: place.address,
  });
}

function officialCard(
  place: TourPlaceSummary,
  allowed: boolean,
): HomepagePlaceCard {
  return {
    id: `tour:${place.contentId}`,
    layer: "official",
    name: place.title?.trim() || "이름 확인 필요",
    categoryLabel: TOUR_CATEGORY_LABELS[place.category],
    district: tourDistrict(place),
    address:
      [place.address, place.detailAddress].filter(Boolean).join(" ") ||
      "주소 확인 필요",
    phone: place.phone?.trim() || null,
    sourceLabel: "한국관광공사",
    statusLabel: allowed ? "동반 가능" : "상세에서 동반 조건 확인",
    warning: null,
    isAllowed: allowed,
    href: tourHref(place),
    external: false,
    imageUrl: place.thumbnailUrl ?? place.imageUrl,
  };
}

function publicCategoryLabel(place: PublicMapPlaceDTO): string {
  if (place.kind === "veterinary") return "동물병원";
  if (place.kind === "pet_shop") return "반려동물 용품";
  return PUBLIC_CATEGORY_LABELS[place.category ?? "other"];
}

function publicCard(place: PublicMapPlaceDTO): HomepagePlaceCard {
  const config = PUBLIC_LAYER_CONFIG[place.kind];
  return {
    id: place.id,
    layer: config.layer,
    name: place.name,
    categoryLabel: publicCategoryLabel(place),
    district: place.district.name,
    address: place.address,
    phone: place.phone,
    sourceLabel: config.sourceLabel,
    statusLabel: config.statusLabel,
    warning: config.warning,
    isAllowed: false,
    href: place.placeUrl,
    external: true,
    imageUrl: null,
  };
}

function markerFromCard(
  card: HomepagePlaceCard,
  coordinates: { latitude: number; longitude: number },
): HomepageMapMarker {
  return {
    ...card,
    coordinates,
  };
}

function readyLayer(
  count: number,
  markerCount: number,
  enabledByDefault: boolean,
): HomepageLayerSnapshot {
  return {
    state: count === 0 ? "empty" : "ready",
    count,
    markerCount,
    enabledByDefault,
  };
}

function unavailableLayer(enabledByDefault: boolean): HomepageLayerSnapshot {
  return {
    state: "unavailable",
    count: null,
    markerCount: null,
    enabledByDefault,
  };
}

export async function collectHomepagePlacesSnapshot({
  service,
  now,
  collectOfficial = collectTourHomepageSnapshot,
  queryPublicCatalog = queryCachedHomepagePublicCatalog,
}: HomepagePlacesDependencies): Promise<HomepagePlacesSnapshot> {
  const publicResultsPromise = Promise.allSettled(
    PUBLIC_LAYER_KINDS.map(async (kind) => ({
      kind,
      page: await queryPublicCatalog({
        kinds: [kind],
        page: 1,
        pageSize: 200,
      }),
    })),
  );
  const official = await collectOfficial({ service, now });
  const allowedIds = new Set(
    official.featured.places
      .filter(
        ({ assessment }) =>
          assessment.verdict === "allowed" &&
          assessment.evaluationState === "complete",
      )
      .map(({ summary }) => summary.contentId),
  );

  const seenOfficialCoordinates = new Set<string>();
  const officialMarkers = official.catalog.places.flatMap((place) => {
    if (!hasCoordinates(place)) return [];
    const coordinateKey = `${place.latitude.toFixed(6)}:${place.longitude.toFixed(6)}`;
    if (seenOfficialCoordinates.has(coordinateKey)) return [];
    seenOfficialCoordinates.add(coordinateKey);
    return [
      markerFromCard(officialCard(place, allowedIds.has(place.contentId)), {
        latitude: place.latitude,
        longitude: place.longitude,
      }),
    ];
  });
  const officialCards = official.featured.places
    .filter(({ summary }) => allowedIds.has(summary.contentId))
    .map(({ summary }) => officialCard(summary, true));

  const publicResults = await publicResultsPromise;

  const layers: Record<HomepagePlaceLayer, HomepageLayerSnapshot> = {
    official: readyLayer(
      official.catalog.totalCount,
      officialMarkers.length,
      true,
    ),
    kakao_candidate: unavailableLayer(true),
    veterinary: unavailableLayer(false),
    pet_shop: unavailableLayer(false),
  };
  const publicMarkers: HomepageMapMarker[] = [];
  const publicCards: HomepagePlaceCard[] = [];

  for (const result of publicResults) {
    if (result.status !== "fulfilled") continue;
    const { kind, page } = result.value;
    const config = PUBLIC_LAYER_CONFIG[kind];
    const cards = page.items.map(publicCard);
    const seenCoordinates = new Set<string>();
    const markers = page.items.flatMap((place, index) => {
      const coordinateKey = `${place.coordinates.latitude.toFixed(6)}:${place.coordinates.longitude.toFixed(6)}`;
      if (seenCoordinates.has(coordinateKey)) return [];
      seenCoordinates.add(coordinateKey);
      return [markerFromCard(cards[index], place.coordinates)];
    });
    layers[config.layer] = readyLayer(
      page.totalCount,
      markers.length,
      config.enabledByDefault,
    );
    publicMarkers.push(...markers);
    publicCards.push(...cards.slice(0, 10));
  }

  const categoryCounts = new Map<TourPlaceCategory, number>();
  for (const place of official.catalog.places) {
    categoryCounts.set(
      place.category,
      (categoryCounts.get(place.category) ?? 0) + 1,
    );
  }

  return {
    official: {
      totalCount: official.catalog.totalCount,
      markerCount: officialMarkers.length,
      omittedCoordinateCount: Math.max(
        0,
        official.catalog.places.length - officialMarkers.length,
      ),
      categoryCounts: CATEGORY_ORDER.flatMap((category) => {
        const count = categoryCounts.get(category) ?? 0;
        return count > 0
          ? [{ label: TOUR_CATEGORY_LABELS[category], count }]
          : [];
      }),
      featuredState: official.featured.state,
      retrievedAt: official.catalog.source.retrievedAt,
    },
    layers,
    markers: [...officialMarkers, ...publicMarkers],
    cards: [...officialCards, ...publicCards],
  };
}
