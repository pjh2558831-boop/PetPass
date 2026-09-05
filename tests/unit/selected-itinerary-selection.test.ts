import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeSelectedItineraryTray } from "@/components/home/home-selected-itinerary-tray";
import {
  homepageSelectionCandidates,
  mergeHomepageSelectionMetadata,
} from "@/components/home/homepage-selected-itinerary";
import {
  useSelectedItinerarySelection,
  type SelectedItinerarySelectionState,
} from "@/components/places/use-selected-itinerary-selection";
import {
  addSelectedItineraryPlace,
  createSelectedItinerarySnapshot,
  loadSelectedItinerary,
  saveSelectedItinerary,
  type SelectedItineraryPlace,
} from "@/lib/storage/selected-itinerary-storage";
import type { StorageLike } from "@/lib/storage/versioned-storage";
import type { HomepageInitialMarkerV1 } from "@/types/homepage-initial";
import type { HomepageMapMarker } from "@/types/homepage-places";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

function place(
  id: string,
  overrides: Partial<SelectedItineraryPlace> = {},
): SelectedItineraryPlace {
  return {
    id,
    regionId: "busan",
    providerPlaceId: id.split(":")[1]!,
    name: `장소 ${id}`,
    layer: "tourism",
    category: "attraction",
    sourceLabel: "한국관광공사",
    publicLabel: "반려동물 동반 정보 확인",
    petAccessVerdict: "allowed",
    imageUrl: null,
    ...overrides,
  };
}

let currentSelection: SelectedItinerarySelectionState | null = null;
let container: HTMLDivElement;
let root: Root;

function SelectionProbe({
  storage,
  surfaceAddLimit,
}: {
  storage: StorageLike;
  surfaceAddLimit?: number;
}) {
  const selection = useSelectedItinerarySelection({
    regionId: "busan",
    storage,
    surfaceAddLimit,
  });

  useEffect(() => {
    currentSelection = selection;
  }, [selection]);

  return null;
}

function getSelection(): SelectedItinerarySelectionState {
  if (!currentSelection) throw new Error("Selection hook is not mounted");
  return currentSelection;
}

async function mountSelection(storage: StorageLike, surfaceAddLimit?: number) {
  await act(async () => {
    root.render(createElement(SelectionProbe, { storage, surfaceAddLimit }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  currentSelection = null;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  currentSelection = null;
});

describe("useSelectedItinerarySelection", () => {
  it("hydrates four canonical selections without truncating them and blocks only new home additions at the surface cap", async () => {
    const storage = new MemoryStorage();
    let stored = createSelectedItinerarySnapshot("busan");
    for (let index = 1; index <= 4; index += 1) {
      stored = addSelectedItineraryPlace(stored, place(`tour:110${index}`)).snapshot;
    }
    expect(saveSelectedItinerary(stored, storage)).toBe(true);

    await mountSelection(storage, 3);

    expect(getSelection().hydrated).toBe(true);
    expect(getSelection().snapshot.places.map(({ id }) => id)).toEqual([
      "tour:1101",
      "tour:1102",
      "tour:1103",
      "tour:1104",
    ]);

    let status = "";
    act(() => {
      status = getSelection().toggle(place("tour:1105")).status;
    });

    expect(status).toBe("surface_limit_reached");
    expect(getSelection().snapshot.places).toHaveLength(4);
    expect(loadSelectedItinerary(storage)?.places).toHaveLength(4);
    expect(getSelection().message).toContain("최대 3곳");
  });

  it("uses the canonical add rules, toggles a selected place off, and persists each result", async () => {
    const storage = new MemoryStorage();
    await mountSelection(storage);

    act(() => {
      expect(getSelection().toggle(place("tour:1101")).status).toBe("selected");
    });
    expect(loadSelectedItinerary(storage)?.places.map(({ id }) => id)).toEqual(["tour:1101"]);
    expect(getSelection().message).toContain("일정에 담았습니다");

    act(() => {
      expect(getSelection().toggle(place("tour:1102", {
        petAccessVerdict: "not_allowed",
      })).status).toBe("selected");
    });
    expect(getSelection().snapshot.places.map(({ id }) => id)).toEqual(["tour:1101", "tour:1102"]);
    expect(getSelection().snapshot.places[1]?.petAccessVerdict).toBe("not_allowed");

    act(() => {
      expect(getSelection().toggle(place("tour:1101")).status).toBe("removed");
    });
    expect(loadSelectedItinerary(storage)?.places).toMatchObject([{ id: "tour:1102", petAccessVerdict: "not_allowed" }]);
    expect(getSelection().message).toContain("일정에서 뺐습니다");
  });

  it("reorders the complete stored array and can reset it to another region", async () => {
    const storage = new MemoryStorage();
    let stored = createSelectedItinerarySnapshot("busan");
    for (let index = 1; index <= 4; index += 1) {
      stored = addSelectedItineraryPlace(stored, place(`tour:110${index}`)).snapshot;
    }
    expect(saveSelectedItinerary(stored, storage)).toBe(true);
    await mountSelection(storage, 3);

    act(() => {
      expect(getSelection().move("tour:1103", "backward")).toBe(true);
    });
    expect(loadSelectedItinerary(storage)?.places.map(({ id }) => id)).toEqual([
      "tour:1101",
      "tour:1102",
      "tour:1104",
      "tour:1103",
    ]);
    expect(getSelection().message).toContain("뒤로 이동했습니다");

    act(() => {
      getSelection().resetRegion("jeju", {
        message: "선택한 장소를 비우고 지역을 변경했습니다.",
      });
    });
    expect(getSelection().snapshot).toMatchObject({ regionId: "jeju", places: [] });
    expect(loadSelectedItinerary(storage)).toMatchObject({ regionId: "jeju", places: [] });
    expect(getSelection().message).toBe("선택한 장소를 비우고 지역을 변경했습니다.");
  });
});

describe("homepage selection metadata", () => {
  it("keeps the tuple verdict and public label when the display projection disagrees", () => {
    const tuple = [
      "tour:1101",
      "원문 판정 장소",
      "tourism",
      "attraction",
      "해운대구",
      35.1587,
      129.16,
      "conditional",
      "실외 구역만 동반 가능",
    ] as const satisfies HomepageInitialMarkerV1;
    const marker: HomepageMapMarker = {
      id: "tour:1101",
      layer: "official",
      name: "원문 판정 장소",
      category: "attraction",
      district: "해운대구",
      address: "부산광역시 해운대구 테스트로 1",
      coordinates: { latitude: 35.1587, longitude: 129.16 },
      sourceLabel: "한국관광공사",
      statusLabel: "화면 투영은 동반 불가",
      isAllowed: false,
      href: "/places/1101?contentTypeId=12",
      imageUrl: "https://images.example.test/place.webp",
    };

    const metadata = mergeHomepageSelectionMetadata(new Map(), [tuple], "busan");
    const candidate = homepageSelectionCandidates(metadata, [marker]).get(marker.id);

    expect(candidate).toMatchObject({
      id: "tour:1101",
      petAccessVerdict: "conditional",
      publicLabel: "실외 구역만 동반 가능",
      imageUrl: "https://images.example.test/place.webp",
    });
  });
});

describe("HomeSelectedItineraryTray", () => {
  it("shows the actual count, only the first three places, overflow management, reorder controls, and the exact CTA", () => {
    const snapshot = {
      ...createSelectedItinerarySnapshot("busan"),
      places: [
        place("tour:1101"),
        place("tour:1102"),
        place("tour:1103"),
        place("tour:1104"),
      ],
    };

    const html = renderToStaticMarkup(createElement(HomeSelectedItineraryTray, {
      snapshot,
      message: "장소 tour:1103을(를) 뒤로 이동했습니다.",
      onRemove: vi.fn(),
      onMove: vi.fn(),
      onContinue: vi.fn(),
    }));

    expect(html).toContain("선택한 장소 4곳");
    expect(html).toContain("장소 tour:1101");
    expect(html).toContain("장소 tour:1103");
    expect(html).not.toContain("장소 tour:1104");
    expect(html).toContain("1곳은 ");
    expect(html).toContain(">장소 선택 화면에서 확인</a>");
    expect(html).toContain("mode=select");
    expect(html).toContain("장소 tour:1101 앞으로 이동");
    expect(html).toContain("장소 tour:1103 뒤로 이동");
    expect(html).toContain("선택한 장소로 일정 만들기");
    expect(html).toContain('<button type="button" class="home-selected-itinerary__continue">');
  });

  it("disables the schedule CTA when nothing is selected", () => {
    const html = renderToStaticMarkup(createElement(HomeSelectedItineraryTray, {
      snapshot: createSelectedItinerarySnapshot("busan"),
      onRemove: vi.fn(),
      onMove: vi.fn(),
      onContinue: vi.fn(),
    }));

    expect(html).toContain('<button type="button" class="home-selected-itinerary__continue" disabled="">');
  });
});
