import {
  PLACE_CATEGORY_LABELS,
  type PlaceCategory,
} from "@/lib/map-places/place-categories";
import type { RegionId } from "@/types/region";
import type { HomepageEnrichmentSnapshot } from "@/types/homepage-enrichment";
import type {
  HomepageInitialLayer,
  HomepageInitialCardDetailV1,
  HomepageInitialLayerSnapshot,
  HomepageInitialMarkerV1,
  HomepageInitialPlacesSnapshot,
} from "@/types/homepage-initial";
import type {
  HomepageLayerSnapshot,
  HomepageMapMarker,
  HomepagePlaceCard,
  HomepagePlaceLayer,
  HomepagePlacesSnapshot,
} from "@/types/homepage-places";

const LAYER_MAP: Record<HomepageInitialLayer, HomepagePlaceLayer> = {
  tourism: "official",
  kakao: "kakao_candidate",
  veterinary: "veterinary",
  pet_shop: "pet_shop",
};

const SOURCE_LABELS: Record<HomepageInitialLayer, string> = {
  tourism: "한국관광공사",
  kakao: "카카오 검색 후보",
  veterinary: "동물병원",
  pet_shop: "펫샵·용품점",
};

function layerSnapshot(
  value: HomepageInitialLayerSnapshot,
  enabledByDefault: boolean,
): HomepageLayerSnapshot {
  return { ...value, enabledByDefault };
}

function markerStatus(
  layer: HomepageInitialLayer,
  verdict: HomepageInitialMarkerV1[7],
  publicLabel: string,
): string {
  if (layer === "tourism" && verdict === "allowed") return "동반 가능";
  if (layer === "veterinary") return "진료 시간 확인 필요";
  if (layer === "pet_shop") return "운영 정보 확인 필요";
  return publicLabel;
}

function markerHref(id: string, layer: HomepageInitialLayer, region: RegionId): string | null {
  const separator = id.indexOf(":");
  const providerPlaceId = separator >= 0 ? id.slice(separator + 1) : "";
  if (!providerPlaceId) return null;
  return layer === "tourism"
    ? `/places/${encodeURIComponent(providerPlaceId)}?region=${encodeURIComponent(region)}`
    : `https://place.map.kakao.com/${encodeURIComponent(providerPlaceId)}`;
}

function projectMarker(
  tuple: HomepageInitialMarkerV1,
  region: RegionId,
  detail?: HomepageInitialCardDetailV1,
): HomepageMapMarker {
  const [id, name, layer, category, district, latitude, longitude, verdict, publicLabel] = tuple;
  return {
    id,
    layer: LAYER_MAP[layer],
    name,
    category,
    district,
    address: detail?.[1] ?? district ?? "주소 확인 필요",
    coordinates: { latitude, longitude },
    sourceLabel: SOURCE_LABELS[layer],
    statusLabel: markerStatus(layer, verdict, publicLabel),
    isAllowed: layer === "tourism" && verdict === "allowed",
    href: markerHref(id, layer, region),
    imageUrl: detail?.[3] ?? null,
  };
}

function cardWarning(layer: HomepagePlaceLayer): string | null {
  if (layer === "kakao_candidate") {
    return "카카오 검색 후보입니다. 방문 전 반려동물 동반 가능 여부를 확인해 주세요.";
  }
  if (layer === "veterinary") return "운영 시간과 진료 가능 여부는 방문 전 확인해 주세요.";
  if (layer === "pet_shop") return "취급 품목과 운영 시간은 방문 전 확인해 주세요.";
  return null;
}

function cardFromMarker(
  marker: HomepageMapMarker,
  detail?: HomepageInitialCardDetailV1,
): HomepagePlaceCard {
  return {
    ...marker,
    categoryLabel: PLACE_CATEGORY_LABELS[marker.category],
    phone: detail?.[2] ?? null,
    warning: cardWarning(marker.layer),
    external: marker.layer !== "official",
  };
}

function initialCards(
  markers: readonly HomepageMapMarker[],
  details: ReadonlyMap<string, HomepageInitialCardDetailV1>,
): HomepagePlaceCard[] {
  return [
    ...markers.filter(({ layer, isAllowed }) => layer === "official" && isAllowed).slice(0, 5),
    ...markers.filter(({ layer }) => layer === "kakao_candidate").slice(0, 10),
    ...markers.filter(({ layer }) => layer === "veterinary").slice(0, 10),
    ...markers.filter(({ layer }) => layer === "pet_shop").slice(0, 10),
  ].map((marker) => cardFromMarker(marker, details.get(marker.id)));
}

function categoryCountsFor(
  snapshot: HomepageInitialPlacesSnapshot,
  layer: HomepageInitialLayer,
): Array<{ category: PlaceCategory; label: string; count: number }> {
  return snapshot.categoryCounts.flatMap(([entryLayer, category, count]) =>
    entryLayer === layer
      ? [{ category, label: PLACE_CATEGORY_LABELS[category], count }]
      : [],
  );
}

export function projectHomepageInitialSnapshot(
  initial: HomepageInitialPlacesSnapshot,
): HomepagePlacesSnapshot {
  const details = new Map(initial.cardDetails.map((detail) => [detail[0], detail]));
  const markers = initial.markers.map((marker) =>
    projectMarker(marker, initial.region, details.get(marker[0])),
  );
  const officialAllowed = markers.some(({ layer, isAllowed }) => layer === "official" && isAllowed);
  return {
    official: {
      totalCount: initial.layers.tourism.count ?? 0,
      markerCount: initial.layers.tourism.markerCount ?? 0,
      omittedCoordinateCount: Math.max(
        0,
        (initial.layers.tourism.count ?? 0) - (initial.layers.tourism.markerCount ?? 0),
      ),
      categoryCounts: categoryCountsFor(initial, "tourism"),
      featuredState: officialAllowed ? "ready" : "empty",
      retrievedAt: initial.generatedAt,
    },
    layers: {
      official: layerSnapshot(initial.layers.tourism, true),
      kakao_candidate: layerSnapshot(initial.layers.kakao, true),
      veterinary: layerSnapshot(initial.layers.veterinary, false),
      pet_shop: layerSnapshot(initial.layers.pet_shop, false),
    },
    markers,
    cards: initialCards(markers, details),
  };
}

function uniqueById<T extends { id: string }>(values: readonly T[]): T[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

export function mergeHomepageOptionalInitial(
  current: HomepagePlacesSnapshot,
  optional: HomepageInitialPlacesSnapshot,
  activeRegion: RegionId,
): HomepagePlacesSnapshot {
  if (optional.region !== activeRegion || optional.scope !== "optional") {
    throw new Error("Homepage optional response region or scope does not match the active request.");
  }
  const projected = projectHomepageInitialSnapshot(optional);
  return {
    ...current,
    layers: {
      ...current.layers,
      veterinary: projected.layers.veterinary,
      pet_shop: projected.layers.pet_shop,
    },
    markers: uniqueById([...current.markers, ...projected.markers]),
    cards: uniqueById([...current.cards, ...projected.cards]),
  };
}

export function mergeHomepageEnrichment(
  current: HomepagePlacesSnapshot,
  enrichment: HomepageEnrichmentSnapshot,
  activeRegion: RegionId,
): HomepagePlacesSnapshot {
  if (enrichment.region !== activeRegion) {
    throw new Error("Homepage enrichment region does not match the active request.");
  }
  const officialCards = enrichment.cards.length > 0
    ? enrichment.cards
    : current.cards.filter(({ layer }) => layer === "official");
  const cards = [
    ...officialCards,
    ...current.cards.filter(({ layer }) => layer !== "official"),
  ];
  const enrichedById = new Map(enrichment.cards.map((card) => [card.id, card]));
  return {
    ...current,
    official: {
      ...current.official,
      featuredState: enrichment.featuredState,
      retrievedAt: enrichment.generatedAt,
    },
    markers: current.markers.map((marker) => {
      const card = enrichedById.get(marker.id);
      return card ? {
        ...marker,
        imageUrl: card.imageUrl,
        isAllowed: true,
        statusLabel: card.statusLabel,
      } : marker;
    }),
    cards: uniqueById(cards),
  };
}

export function shouldApplyHomepageResponse(
  activeRequestKey: string | null,
  responseRequestKey: string,
): boolean {
  return activeRequestKey !== null && activeRequestKey === responseRequestKey;
}
