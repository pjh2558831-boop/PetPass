import {
  PLACE_CATEGORY_LABELS,
  type PlaceCategory,
} from "@/lib/map-places/place-categories";
import type { RegionId } from "@/types/region";
import type { HomepageEnrichmentSnapshot } from "@/types/homepage-enrichment";
import type { HomepageCompletionSnapshot } from "@/types/homepage-completion";
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
import type { HomepageOptionalSnapshot } from "@/types/homepage-optional";

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
  void verdict;
  void publicLabel;
  if (layer === "veterinary") return "진료 시간 확인 필요";
  if (layer === "pet_shop") return "운영 정보 확인 필요";
  return "반려동물 동반 가능";
}

function markerHref(id: string, layer: HomepageInitialLayer, region: RegionId): string | null {
  const separator = id.indexOf(":");
  const providerPlaceId = separator >= 0 ? id.slice(separator + 1) : "";
  if (!providerPlaceId) return null;
  return layer === "tourism"
    ? `/places/${encodeURIComponent(providerPlaceId)}?region=${encodeURIComponent(region)}`
    : `https://place.map.kakao.com/${encodeURIComponent(providerPlaceId)}`;
}

export function projectHomepageMarker(
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
    isAllowed: layer === "tourism" || layer === "kakao",
    href: markerHref(id, layer, region),
    imageUrl: detail?.[3] ?? null,
  };
}

function cardWarning(layer: HomepagePlaceLayer): string | null {
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
    projectHomepageMarker(marker, initial.region, details.get(marker[0])),
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

function markerEqual(left: HomepageMapMarker, right: HomepageMapMarker): boolean {
  return left.id === right.id && left.layer === right.layer && left.name === right.name &&
    left.category === right.category && left.district === right.district && left.address === right.address &&
    left.coordinates.latitude === right.coordinates.latitude &&
    left.coordinates.longitude === right.coordinates.longitude &&
    left.sourceLabel === right.sourceLabel && left.statusLabel === right.statusLabel &&
    left.isAllowed === right.isAllowed && left.href === right.href && left.imageUrl === right.imageUrl;
}

export function mergeHomepageCompletion(
  current: HomepagePlacesSnapshot,
  completion: HomepageCompletionSnapshot,
  base: Pick<HomepageInitialPlacesSnapshot, "region" | "scope" | "dataVersion" | "generationId">,
  activeRegion: RegionId,
): HomepagePlacesSnapshot {
  if (completion.region !== activeRegion || base.region !== activeRegion ||
    completion.scope !== "default" || base.scope !== "default") {
    throw new Error("Homepage completion response crossed region or scope boundaries.");
  }
  if (completion.baseDataVersion !== base.dataVersion || completion.generationId !== base.generationId) {
    throw new Error("Homepage completion response does not match the initial generation.");
  }
  const currentById = new Map(current.markers.map((marker) => [marker.id, marker] as const));
  for (const tuple of completion.markers) {
    const projected = projectHomepageMarker(tuple, activeRegion);
    const existing = currentById.get(projected.id);
    currentById.set(projected.id, existing && markerEqual(existing, projected) ? existing : projected);
  }
  const orderedIds = new Set(current.markers.map(({ id }) => id));
  const markers = [
    ...current.markers.map(({ id }) => currentById.get(id) as HomepageMapMarker),
    ...completion.markers.flatMap(([id]) => {
      if (orderedIds.has(id)) return [];
      orderedIds.add(id);
      return currentById.get(id) ?? [];
    }),
  ];
  const markerCounts = new Map<HomepagePlaceLayer, number>();
  for (const marker of markers) markerCounts.set(marker.layer, (markerCounts.get(marker.layer) ?? 0) + 1);
  const layerFor = (layer: HomepageInitialLayer): HomepagePlaceLayer => LAYER_MAP[layer];
  const layers = { ...current.layers };
  for (const continuation of completion.continuations) {
    const layer = layerFor(continuation.layer);
    layers[layer] = {
      ...layers[layer],
      state: continuation.complete ? (continuation.expectedTotalCount === 0 ? "empty" : "ready") : layers[layer].state,
      count: continuation.expectedTotalCount,
      markerCount: markerCounts.get(layer) ?? 0,
    };
  }
  const officialCounts = new Map(current.official.categoryCounts.map((entry) => [entry.category, entry] as const));
  for (const [layer, category, count] of completion.categoryCounts) {
    if (layer !== "tourism") continue;
    const previous = officialCounts.get(category);
    officialCounts.set(category, {
      category,
      label: PLACE_CATEGORY_LABELS[category],
      count: (previous?.count ?? 0) + count,
    });
  }
  return {
    ...current,
    official: {
      ...current.official,
      markerCount: markerCounts.get("official") ?? 0,
      omittedCoordinateCount: Math.max(0, current.official.totalCount - (markerCounts.get("official") ?? 0)),
      categoryCounts: [...officialCounts.values()],
      retrievedAt: completion.generatedAt,
    },
    layers,
    markers,
  };
}

function uniqueById<T extends { id: string }>(values: readonly T[]): T[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

export function mergeHomepageOptionalInitial(
  current: HomepagePlacesSnapshot,
  optional: HomepageOptionalSnapshot,
  activeRegion: RegionId,
): HomepagePlacesSnapshot {
  if (optional.region !== activeRegion || optional.scope !== "optional") {
    throw new Error("Homepage optional response region or scope does not match the active request.");
  }
  const projected = projectHomepageInitialSnapshot(optional);
  const veterinary = projected.layers.veterinary.state === "deferred"
    ? current.layers.veterinary
    : projected.layers.veterinary;
  const petShop = projected.layers.pet_shop.state === "deferred"
    ? current.layers.pet_shop
    : projected.layers.pet_shop;
  const markers = uniqueById([...current.markers, ...projected.markers]);
  if (optional.providers === "tour") {
    const optionalCategories = new Map(
      optional.categoryCounts.map(([, category, count]) => [category, count] as const),
    );
    const currentCategories = new Map(
      current.official.categoryCounts.map((entry) => [entry.category, entry] as const),
    );
    let replacedCount = 0;
    for (const [category, count] of optionalCategories) {
      replacedCount += currentCategories.get(category)?.count ?? 0;
      currentCategories.set(category, {
        category,
        label: PLACE_CATEGORY_LABELS[category],
        count,
      });
    }
    const officialMarkerCount = markers.filter(({ layer }) => layer === "official").length;
    const officialTotalCount = current.official.totalCount - replacedCount + optional.totalCount;
    return {
      ...current,
      official: {
        ...current.official,
        totalCount: officialTotalCount,
        markerCount: officialMarkerCount,
        omittedCoordinateCount: Math.max(0, officialTotalCount - officialMarkerCount),
        categoryCounts: [...currentCategories.values()],
        retrievedAt: optional.retrievedAt,
      },
      layers: {
        ...current.layers,
        official: {
          ...current.layers.official,
          state: officialTotalCount === 0 ? "empty" : "ready",
          count: officialTotalCount,
          markerCount: officialMarkerCount,
        },
      },
      markers,
    };
  }
  return {
    ...current,
    layers: {
      ...current.layers,
      veterinary,
      pet_shop: petShop,
    },
    markers,
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
