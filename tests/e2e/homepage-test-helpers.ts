import type { Page, Route } from "@playwright/test";
import type {
  HomepageLayerSnapshot,
  HomepageMapMarker,
  HomepagePlaceCard,
  HomepagePlaceLayer,
  HomepagePlacesSnapshot,
} from "@/types/homepage-places";
import type { HomepageEnrichmentSnapshot } from "@/types/homepage-enrichment";
import type { HomepageCompletionSnapshot } from "@/types/homepage-completion";
import type {
  HomepageInitialLayer,
  HomepageInitialMarkerV1,
  HomepageInitialPlacesSnapshot,
} from "@/types/homepage-initial";
import {
  homepageOptionalDataHash,
  type HomepageOptionalDatasetId,
  type HomepageOptionalSnapshot,
} from "@/types/homepage-optional";

export const HOMEPAGE_INITIAL_API = "**/api/homepage/places/initial?**";
export const HOMEPAGE_ENRICHMENT_API = "**/api/homepage/places/enrichment?**";
export const HOMEPAGE_OPTIONAL_API = "**/api/homepage/places/optional?**";
export const HOMEPAGE_COMPLETION_API = "**/api/homepage/places/completion?**";
export const GENERATE_API_PATH = "/api/itineraries/generate";
export const RETRIEVED_AT = "2026-08-15T02:00:00.000Z";
export const NETWORK_TEST = "loads one compact base snapshot and only one canonical Kakao SDK";
export const MAP_FAILURE_TEST = "keeps search, list, and itinerary selection usable when Kakao Maps fails";

export const LAYER_COUNTS: Record<HomepagePlaceLayer, HomepageLayerSnapshot> = {
  official: { state: "ready", count: 37, markerCount: 4, enabledByDefault: true },
  kakao_candidate: { state: "ready", count: 120, markerCount: 1, enabledByDefault: true },
  veterinary: { state: "ready", count: 42, markerCount: 1, enabledByDefault: false },
  pet_shop: { state: "ready", count: 18, markerCount: 1, enabledByDefault: false },
};

export function marker(
  id: string,
  layer: HomepagePlaceLayer,
  name: string,
  coordinates: { latitude: number; longitude: number },
  overrides: Partial<HomepageMapMarker> = {},
): HomepageMapMarker {
  const labels = {
    official: ["한국관광공사", "상세에서 동반 조건 확인"],
    kakao_candidate: ["카카오 검색 후보", "동반 여부 확인 필요"],
    veterinary: ["동물병원", "진료 시간 확인 필요"],
    pet_shop: ["펫샵·용품점", "운영 정보 확인 필요"],
  } as const;
  return {
    id,
    layer,
    name,
    category: layer === "veterinary" ? "veterinary" : layer === "pet_shop" ? "pet_shop" : "attraction",
    district: "해운대구",
    address: "부산광역시 해운대구 테스트로 1",
    coordinates,
    sourceLabel: labels[layer][0],
    statusLabel: labels[layer][1],
    isAllowed: false,
    href: layer === "official" ? `/places/${id.slice(5)}?contentTypeId=12` : `https://place.map.kakao.com/${id.split(":")[1]}`,
    imageUrl: null,
    ...overrides,
  };
}

export function cardFromMarker(value: HomepageMapMarker): HomepagePlaceCard {
  return {
    id: value.id,
    layer: value.layer,
    name: value.name,
    category: value.category,
    categoryLabel: value.category === "veterinary"
      ? "동물병원"
      : value.category === "pet_shop" ? "반려동물 용품" : value.category === "cafe" ? "카페" : "관광·문화",
    district: value.district,
    address: value.address,
    phone: value.layer === "veterinary" || value.layer === "pet_shop" ? "051-123-4567" : null,
    sourceLabel: value.sourceLabel,
    statusLabel: value.statusLabel,
    warning: value.layer === "official" ? null : "방문 전 현재 정보를 확인해 주세요.",
    isAllowed: value.isAllowed,
    href: value.href,
    external: value.href?.startsWith("http") ?? false,
    imageUrl: value.imageUrl,
  };
}

export const OFFICIAL_ALLOWED = marker(
  "tour:1101",
  "official",
  "해운대 달맞이 산책로",
  { latitude: 35.1587, longitude: 129.16 },
  { isAllowed: true, statusLabel: "동반 가능" },
);
export const OFFICIAL_NEUTRAL = marker(
  "tour:1102",
  "official",
  "부산 시민공원 산책길",
  { latitude: 35.1686, longitude: 129.0572 },
);
export const OFFICIAL_CAFE = marker(
  "tour:1103",
  "official",
  "광안리 바다 전망 카페",
  { latitude: 35.1534, longitude: 129.1198 },
  {
    category: "cafe",
    district: "수영구",
    isAllowed: true,
    statusLabel: "동반 가능",
  },
);
export const OFFICIAL_STAY = marker(
  "tour:1104",
  "official",
  "기장 반려견 동반 숙소",
  { latitude: 35.1962, longitude: 129.2234 },
  {
    category: "accommodation",
    district: "기장군",
    isAllowed: true,
    statusLabel: "동반 가능",
  },
);
export const KAKAO_CANDIDATE = marker(
  "kakao:101",
  "kakao_candidate",
  "광안리 반려견 검색 후보",
  { latitude: 35.1532, longitude: 129.1187 },
  { category: "cafe", district: "수영구" },
);
export const VETERINARY = marker(
  "kakao:102",
  "veterinary",
  "부산 반려동물 동물병원",
  { latitude: 35.17, longitude: 129.18 },
);
export const PET_SHOP = marker(
  "kakao:103",
  "pet_shop",
  "부산 반려동물 용품점",
  { latitude: 35.18, longitude: 129.19 },
);
export const KTO_SHOPPING = marker(
  "tour:1105",
  "official",
  "부산 공식 쇼핑 장소",
  { latitude: 35.19, longitude: 129.2 },
  { category: "shopping", statusLabel: "동반 정보 확인 필요" },
);

export const SNAPSHOT: HomepagePlacesSnapshot = {
  official: {
    totalCount: 37,
    markerCount: 2,
    omittedCoordinateCount: 1,
    categoryCounts: [
      { category: "attraction", label: "관광지", count: 37 },
    ],
    featuredState: "ready",
    retrievedAt: RETRIEVED_AT,
  },
  layers: LAYER_COUNTS,
  markers: [
    OFFICIAL_ALLOWED,
    OFFICIAL_NEUTRAL,
    OFFICIAL_CAFE,
    OFFICIAL_STAY,
    KAKAO_CANDIDATE,
    VETERINARY,
    PET_SHOP,
  ],
  cards: [
    cardFromMarker(OFFICIAL_ALLOWED),
    cardFromMarker(OFFICIAL_CAFE),
    cardFromMarker(OFFICIAL_STAY),
    cardFromMarker(KAKAO_CANDIDATE),
    cardFromMarker(VETERINARY),
    cardFromMarker(PET_SHOP),
  ],
};

export function initialLayer(layer: HomepagePlaceLayer): HomepageInitialLayer {
  return layer === "official" ? "tourism" : layer === "kakao_candidate" ? "kakao" : layer;
}

export function initialSnapshot(
  snapshot = SNAPSHOT,
  scope: "default" | "optional" = "default",
): HomepageInitialPlacesSnapshot {
  const includedLayers: HomepagePlaceLayer[] = scope === "default"
    ? ["official", "kakao_candidate"]
    : ["veterinary", "pet_shop"];
  const markers: HomepageInitialMarkerV1[] = snapshot.markers.flatMap((marker) =>
    includedLayers.includes(marker.layer) ? [[
      marker.id,
      marker.name,
      initialLayer(marker.layer),
      marker.category,
      marker.district,
      marker.coordinates.latitude,
      marker.coordinates.longitude,
      marker.layer === "official" && marker.isAllowed ? "allowed" : "unknown",
      marker.statusLabel,
    ]] : [],
  );
  const deferred = { state: "deferred" as const, count: null, markerCount: null };
  const sourceLayer = (layer: HomepagePlaceLayer) => ({
    state: snapshot.layers[layer].state === "deferred" ? "empty" as const : snapshot.layers[layer].state,
    count: snapshot.layers[layer].count,
    markerCount: markers.filter((marker) => marker[2] === initialLayer(layer)).length,
  });
  const layers = scope === "default" ? {
    tourism: sourceLayer("official"),
    kakao: sourceLayer("kakao_candidate"),
    veterinary: deferred,
    pet_shop: deferred,
  } : {
    tourism: deferred,
    kakao: deferred,
    veterinary: sourceLayer("veterinary"),
    pet_shop: sourceLayer("pet_shop"),
  };
  const categoryCounts: HomepageInitialPlacesSnapshot["categoryCounts"] = scope === "default"
    ? [
        ...snapshot.official.categoryCounts.map(({ category, count }) => ["tourism" as const, category, count] as const),
        ...markers.filter((marker) => marker[2] === "kakao").map((marker) => ["kakao" as const, marker[3], 1] as const),
      ]
    : markers.map((marker) => [marker[2], marker[3], 1] as const);
  const totalCount = Object.values(layers).reduce(
    (sum, layer) => sum + (layer.count ?? 0),
    0,
  );
  return {
    contractVersion: 1,
    region: "busan",
    scope,
    providers: scope === "default" ? "default" : "kakao",
    generatedAt: snapshot.official.retrievedAt,
    dataVersion: scope === "default" ? "v1-0123456789abcdef" : "v1-fedcba9876543210",
    generationId: scope === "default" ? "g1-0123456789abcdef" : "g1-fedcba9876543210",
    totalCount,
    markerCount: markers.length,
    freshness: { status: "fresh" },
    layers,
    categoryCounts,
    markers,
    cardDetails: scope === "optional"
      ? snapshot.markers.flatMap((marker) => includedLayers.includes(marker.layer)
        ? [[
            marker.id,
            marker.address,
            snapshot.cards.find(({ id }) => id === marker.id)?.phone ?? null,
            marker.imageUrl,
          ] as const]
        : [])
      : [],
    continuations: [],
  };
}

export function initialSnapshotWithCompletion(): HomepageInitialPlacesSnapshot {
  const initial = initialSnapshot();
  const expectedTotalCount = initial.layers.kakao.count ?? 1;
  return {
    ...initial,
    continuations: [{
      datasetId: "default-kakao",
      layer: "kakao",
      provider: "kakao",
      kind: "pet_travel_candidate",
      loadedItemCount: 1,
      expectedTotalCount,
      nextCursor: 2,
      complete: false,
      generationId: initial.generationId,
    }],
  };
}

export function completedHomepageSnapshot(
  initial: HomepageInitialPlacesSnapshot,
): HomepageCompletionSnapshot {
  const expectedTotalCount = initial.layers.kakao.count ?? 1;
  return {
    contractVersion: 1,
    region: "busan",
    scope: "default",
    dataset: "default-map",
    baseDataVersion: initial.dataVersion,
    generationId: initial.generationId,
    generatedAt: RETRIEVED_AT,
    returnedItemCount: 1,
    expectedTotalCount,
    complete: true,
    freshness: { status: "fresh" },
    continuations: [{
      datasetId: "default-kakao",
      layer: "kakao",
      provider: "kakao",
      kind: "pet_travel_candidate",
      loadedItemCount: expectedTotalCount,
      expectedTotalCount,
      nextCursor: null,
      complete: true,
      generationId: initial.generationId,
    }],
    categoryCounts: [["kakao", "cafe", 1]],
    markers: [[
      "kakao:106",
      "완료 응답으로 추가된 카페",
      "kakao",
      "cafe",
      "수영구",
      35.154,
      129.121,
      "unknown",
      "동반 여부 확인 필요",
    ]],
  };
}

export function optionalSnapshot(
  snapshot: HomepagePlacesSnapshot,
  dataset: HomepageOptionalDatasetId,
): HomepageOptionalSnapshot {
  const layer = dataset === "optional-kto-shopping"
    ? "tourism"
    : dataset === "optional-veterinary" ? "veterinary" : "pet_shop";
  const kind = layer === "tourism" ? "tourism_place" : layer;
  const base = initialSnapshot(snapshot, "optional");
  const markers: HomepageInitialMarkerV1[] = layer === "tourism" ? [[
    KTO_SHOPPING.id,
    KTO_SHOPPING.name,
    "tourism",
    "shopping",
    KTO_SHOPPING.district,
    KTO_SHOPPING.coordinates.latitude,
    KTO_SHOPPING.coordinates.longitude,
    "unknown",
    KTO_SHOPPING.statusLabel,
  ]] : base.markers.filter((marker) => marker[2] === layer);
  const markerIds = new Set(markers.map((marker) => marker[0]));
  const generationId = dataset === "optional-veterinary"
    ? "g1-aaaaaaaaaaaaaaaa"
    : "g1-bbbbbbbbbbbbbbbb";
  const optional = {
    ...base,
    scope: "optional",
    providers: layer === "tourism" ? "tour" : "kakao",
    dataset,
    status: markers.length === 0 ? "complete_empty" : "complete",
    retrievedAt: RETRIEVED_AT,
    dataVersion: dataset === "optional-veterinary"
      ? "v1-aaaaaaaaaaaaaaaa"
      : "v1-bbbbbbbbbbbbbbbb",
    generationId,
    totalCount: markers.length,
    markerCount: markers.length,
    layers: {
      tourism: layer === "tourism"
        ? { state: markers.length === 0 ? "empty" : "ready", count: markers.length, markerCount: markers.length }
        : { state: "deferred", count: null, markerCount: null },
      kakao: { state: "deferred", count: null, markerCount: null },
      veterinary: layer === "veterinary"
        ? { state: markers.length === 0 ? "empty" : "ready", count: markers.length, markerCount: markers.length }
        : { state: "deferred", count: null, markerCount: null },
      pet_shop: layer === "pet_shop"
        ? { state: markers.length === 0 ? "empty" : "ready", count: markers.length, markerCount: markers.length }
        : { state: "deferred", count: null, markerCount: null },
    },
    categoryCounts: layer === "tourism"
      ? [["tourism", "shopping", markers.length]]
      : base.categoryCounts.filter(([entryLayer]) => entryLayer === layer),
    markers,
    cardDetails: layer === "tourism"
      ? []
      : base.cardDetails.filter(([id]) => markerIds.has(id)),
    integrity: {
      dataHash: "",
      expectedItemCount: markers.length,
      returnedItemCount: markers.length,
      providerTotalCount: markers.length,
      visibilityTotalCount: layer === "tourism" ? markers.length : null,
      pageCount: 1,
      visibilityPageCount: layer === "tourism" ? 1 : null,
      pageSize: 200,
      nextCursor: null,
      traversalComplete: true,
    },
    continuations: [{
      datasetId: dataset,
      layer,
      provider: layer === "tourism" ? "tour" : "kakao",
      kind,
      loadedItemCount: markers.length,
      expectedTotalCount: markers.length,
      nextCursor: null,
      complete: true,
      generationId,
    }],
  } satisfies HomepageOptionalSnapshot;
  optional.integrity.dataHash = homepageOptionalDataHash(optional);
  return optional;
}

export function enrichmentSnapshot(snapshot = SNAPSHOT): HomepageEnrichmentSnapshot {
  return {
    contractVersion: 1,
    region: "busan",
    scope: "featured",
    generatedAt: snapshot.official.retrievedAt,
    dataVersion: "v1-1111111111111111",
    freshness: { status: "fresh" },
    featuredState: snapshot.official.featuredState,
    cards: snapshot.cards.filter(({ layer, isAllowed }) => layer === "official" && isAllowed),
  };
}

export async function fulfillInitial(
  route: Route,
  snapshot = SNAPSHOT,
  scope: "default" | "optional" = "default",
) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: initialSnapshot(snapshot, scope), requestId: "homepage-initial-e2e" }),
  });
}

export async function mockHomepage(page: Page, snapshot = SNAPSHOT) {
  await page.route(HOMEPAGE_INITIAL_API, (route) => {
    const scope = new URL(route.request().url()).searchParams.get("scope") === "optional"
      ? "optional"
      : "default";
    return fulfillInitial(route, snapshot, scope);
  });
  await page.route(HOMEPAGE_OPTIONAL_API, (route) => {
    const dataset = new URL(route.request().url()).searchParams.get("dataset") as HomepageOptionalDatasetId;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: optionalSnapshot(snapshot, dataset), requestId: "homepage-optional-e2e" }),
    });
  });
  await page.route(HOMEPAGE_ENRICHMENT_API, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: enrichmentSnapshot(snapshot), requestId: "homepage-enrichment-e2e" }),
  }));
}

export async function installFakeMap(page: Page) {
  await page.addInitScript(() => {
    type Listener = (...args: unknown[]) => void;
    const listeners = new WeakMap<object, Map<string, Set<Listener>>>();
    const addListener = (target: object, name: string, handler: Listener) => {
      const targetListeners = listeners.get(target) ?? new Map<string, Set<Listener>>();
      const values = targetListeners.get(name) ?? new Set<Listener>();
      values.add(handler);
      targetListeners.set(name, values);
      listeners.set(target, targetListeners);
    };
    const emit = (target: object, name: string, ...args: unknown[]) => {
      listeners.get(target)?.get(name)?.forEach((handler) => handler(...args));
    };
    class LatLng {
      constructor(private latitude: number, private longitude: number) {}
      getLat() { return this.latitude; }
      getLng() { return this.longitude; }
    }
    class Bounds {
      extend() {}
      getNorthEast() { return new LatLng(35.3, 129.3); }
      getSouthWest() { return new LatLng(35, 129); }
    }
    class FakeMap {
      private center: LatLng;
      constructor(readonly container: HTMLElement, options: { center: LatLng }) {
        this.center = options.center;
        container.dataset.fakeMapReady = "true";
      }
      getBounds() { return new Bounds(); }
      getCenter() { return this.center; }
      panTo(value: LatLng) { this.center = value; }
      relayout() {}
      setBounds() {}
    }
    class Marker {
      private readonly element = document.createElement("button");
      constructor(options: { title?: string }) {
        this.element.type = "button";
        this.element.className = "fake-kakao-native-marker";
        this.element.setAttribute("aria-label", options.title ?? "지도 마커");
        this.element.addEventListener("click", () => emit(this, "click"));
      }
      setImage() {}
      setMap(map: FakeMap | null) {
        if (map) map.container.append(this.element);
        else this.element.remove();
      }
      setPosition() {}
      setTitle(title: string) { this.element.setAttribute("aria-label", title); }
      setZIndex() {}
    }
    class Overlay {
      constructor(private options: { map: FakeMap; content: HTMLElement }) {
        options.map.container.append(options.content);
      }
      setMap(map: FakeMap | null) { if (!map) this.options.content.remove(); }
    }
    class Polyline { setMap() {} }
    class Clusterer {
      private markers: Marker[] = [];
      constructor(private options: { map: FakeMap }) {}
      addMarkers(markers: Marker[]) {
        this.markers = markers;
        markers.forEach((marker) => marker.setMap(this.options.map));
      }
      removeMarkers(markers: Marker[]) {
        const removed = new Set(markers);
        markers.forEach((marker) => marker.setMap(null));
        this.markers = this.markers.filter((marker) => !removed.has(marker));
      }
      clear() { this.markers.forEach((marker) => marker.setMap(null)); this.markers = []; }
      redraw() {}
    }
    window.kakao = { maps: {
      load: (callback: () => void) => callback(),
      event: { addListener, removeListener(target: object, name: string, handler: Listener) { listeners.get(target)?.get(name)?.delete(handler); } },
      LatLng, LatLngBounds: Bounds, Map: FakeMap, CustomOverlay: Overlay, Marker,
      MarkerImage: class {}, MarkerClusterer: Clusterer, Point: class {},
      Polyline, Size: class {},
    } as unknown as NonNullable<Window["kakao"]>["maps"] };
  });
}

export async function installHomepageImageFixture(page: Page) {
  await page.route("**/_next/image?**", (route) => {
    const source = new URL(route.request().url()).searchParams.get("url");
    if (source?.startsWith("/api/places/") && source.includes("/location-thumbnail")) {
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        path: "public/images/home/hero/01-corgi-tulips.png",
      });
    }
    if (source?.startsWith("/")) return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "image/png",
      path: "public/images/home/hero/01-corgi-tulips.png",
    });
  });
}
