import type { PlaceCategory } from "@/lib/map-places/place-categories";
import type { HomepageDatasetId } from "@/lib/homepage/catalog-datasets";
import type {
  HomepageMapMarker,
  HomepagePlaceLayer,
} from "@/types/homepage-places";
import type { RegionId } from "@/types/region";

export type HomepageCatalogProvider = "tour" | "kakao";

export interface HomepageCatalogFilter {
  categories?: readonly PlaceCategory[];
  providers?: readonly HomepageCatalogProvider[];
  districts?: readonly string[];
  datasets?: readonly HomepageDatasetId[];
}

export interface HomepageCatalogFilterResult {
  markers: HomepageMapMarker[];
  inspectedIdCount: number;
}

const LAYER_PROVIDER: Record<HomepagePlaceLayer, HomepageCatalogProvider> = {
  official: "tour",
  kakao_candidate: "kakao",
  veterinary: "kakao",
  pet_shop: "kakao",
};

const LAYER_DATASET: Record<HomepagePlaceLayer, HomepageDatasetId> = {
  official: "default-tour",
  kakao_candidate: "default-kakao",
  veterinary: "optional-veterinary",
  pet_shop: "optional-pet-shop",
};

function addToIndex<K>(index: Map<K, Set<string>>, key: K, id: string): void {
  const ids = index.get(key);
  if (ids) ids.add(id);
  else index.set(key, new Set([id]));
}

function union<K>(index: ReadonlyMap<K, ReadonlySet<string>>, keys: readonly K[]): Set<string> {
  const result = new Set<string>();
  for (const key of keys) for (const id of index.get(key) ?? []) result.add(id);
  return result;
}

function intersectsAll(id: string, sets: readonly ReadonlySet<string>[]): boolean {
  return sets.every((set) => set.has(id));
}

export class HomepageCatalogIndex {
  readonly regionId: RegionId;
  readonly orderedIds: readonly string[];
  readonly byId: ReadonlyMap<string, HomepageMapMarker>;
  readonly byCategory: ReadonlyMap<PlaceCategory, ReadonlySet<string>>;
  readonly byProvider: ReadonlyMap<HomepageCatalogProvider, ReadonlySet<string>>;
  readonly byDistrict: ReadonlyMap<string, ReadonlySet<string>>;
  readonly byDataset: ReadonlyMap<HomepageDatasetId, ReadonlySet<string>>;
  readonly reusedMarkerCount: number;

  constructor(
    regionId: RegionId,
    markers: readonly HomepageMapMarker[],
    previous?: HomepageCatalogIndex | null,
  ) {
    this.regionId = regionId;
    const canReuse = previous?.regionId === regionId &&
      previous.orderedIds.length <= markers.length &&
      previous.orderedIds.every((id, index) => previous.byId.get(id) === markers[index]);
    const byId = canReuse
      ? new Map(previous.byId)
      : new Map<string, HomepageMapMarker>();
    const cloneIndex = <K>(source?: ReadonlyMap<K, ReadonlySet<string>>) =>
      new Map([...(source ?? [])].map(([key, ids]) => [key, new Set(ids)] as const));
    const byCategory = cloneIndex(canReuse ? previous.byCategory : undefined);
    const byProvider = cloneIndex(canReuse ? previous.byProvider : undefined);
    const byDistrict = cloneIndex(canReuse ? previous.byDistrict : undefined);
    const byDataset = cloneIndex(canReuse ? previous.byDataset : undefined);
    const reusedMarkerCount = canReuse ? previous.orderedIds.length : 0;
    for (const marker of markers.slice(reusedMarkerCount)) {
      if (byId.has(marker.id)) throw new Error("Homepage canonical catalog contains duplicate stable IDs.");
      byId.set(marker.id, marker);
      addToIndex(byCategory, marker.category, marker.id);
      addToIndex(byProvider, LAYER_PROVIDER[marker.layer], marker.id);
      if (marker.district) addToIndex(byDistrict, marker.district, marker.id);
      addToIndex(byDataset, LAYER_DATASET[marker.layer], marker.id);
    }
    this.orderedIds = [...byId.keys()];
    this.byId = byId;
    this.byCategory = byCategory;
    this.byProvider = byProvider;
    this.byDistrict = byDistrict;
    this.byDataset = byDataset;
    this.reusedMarkerCount = reusedMarkerCount;
  }

  filter(filter: HomepageCatalogFilter): HomepageCatalogFilterResult {
    const dimensions: Set<string>[] = [];
    if (filter.categories) dimensions.push(union(this.byCategory, filter.categories));
    if (filter.providers) dimensions.push(union(this.byProvider, filter.providers));
    if (filter.districts) dimensions.push(union(this.byDistrict, filter.districts));
    if (filter.datasets) dimensions.push(union(this.byDataset, filter.datasets));
    if (dimensions.length === 0) {
      return { markers: this.orderedIds.flatMap((id) => this.byId.get(id) ?? []), inspectedIdCount: this.orderedIds.length };
    }
    dimensions.sort((left, right) => left.size - right.size);
    const candidates = dimensions[0];
    const matches = new Set<string>();
    for (const id of candidates) if (intersectsAll(id, dimensions.slice(1))) matches.add(id);
    return {
      markers: this.orderedIds.flatMap((id) => matches.has(id) ? this.byId.get(id) ?? [] : []),
      inspectedIdCount: candidates.size,
    };
  }

  countCategory(category: PlaceCategory): number {
    return this.byCategory.get(category)?.size ?? 0;
  }
}

export function markerMatchesHomepageCatalogFilter(
  marker: HomepageMapMarker,
  filter: HomepageCatalogFilter,
): boolean {
  return (!filter.categories || filter.categories.includes(marker.category)) &&
    (!filter.providers || filter.providers.includes(LAYER_PROVIDER[marker.layer])) &&
    (!filter.districts || Boolean(marker.district && filter.districts.includes(marker.district))) &&
    (!filter.datasets || filter.datasets.includes(LAYER_DATASET[marker.layer]));
}
