"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MAX_SELECTED_ITINERARY_PLACES,
  addSelectedItineraryPlace,
  createSelectedItinerarySnapshot,
  loadSelectedItinerary,
  removeSelectedItineraryPlace,
  saveSelectedItinerary,
  type AddSelectedItineraryPlaceResult,
  type SelectedItineraryPlace,
  type SelectedItinerarySnapshot,
} from "@/lib/storage/selected-itinerary-storage";
import type { StorageLike } from "@/lib/storage/versioned-storage";
import { getRegionConfig } from "@/lib/regions/config";
import type { RegionId } from "@/types/region";

export type SelectedItineraryMoveDirection = "forward" | "backward";

export type SelectedItineraryToggleResult = {
  status:
    | AddSelectedItineraryPlaceResult["status"]
    | "removed"
    | "surface_limit_reached";
  snapshot: SelectedItinerarySnapshot;
};

export type SelectedItinerarySelectionState = {
  snapshot: SelectedItinerarySnapshot;
  hydrated: boolean;
  message: string;
  toggle: (place: SelectedItineraryPlace) => SelectedItineraryToggleResult;
  remove: (placeId: string) => void;
  move: (placeId: string, direction: SelectedItineraryMoveDirection) => boolean;
  setAutoFill: (enabled: boolean) => void;
  setIncludeVerificationRequired: (enabled: boolean) => void;
  resetRegion: (
    regionId: RegionId,
    options?: { preserveAutoFill?: boolean; message?: string },
  ) => void;
};

type UseSelectedItinerarySelectionOptions = {
  regionId: RegionId;
  enabled?: boolean;
  surfaceAddLimit?: number;
  storage?: StorageLike | null;
};

const SAVE_ERROR_MESSAGE = "선택을 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.";

function blockedSelectionMessage(
  status: Exclude<AddSelectedItineraryPlaceResult["status"], "selected">,
): string {
  if (status === "limit_reached") {
    return `일정에는 최대 ${MAX_SELECTED_ITINERARY_PLACES}곳까지 담을 수 있습니다.`;
  }
  if (status === "blocked_not_allowed") {
    return "동반 불가로 확인된 장소는 일정에 담을 수 없습니다.";
  }
  if (status === "blocked_unsupported") {
    return "동물병원과 펫샵은 여행 일정 방문지로 담을 수 없습니다.";
  }
  if (status === "already_selected") {
    return "이미 일정에 담은 장소입니다.";
  }
  return "현재 지역의 장소만 함께 담을 수 있습니다.";
}

export function useSelectedItinerarySelection({
  regionId,
  enabled = true,
  surfaceAddLimit,
  storage,
}: UseSelectedItinerarySelectionOptions): SelectedItinerarySelectionState {
  const [snapshot, setSnapshot] = useState<SelectedItinerarySnapshot>(() =>
    createSelectedItinerarySnapshot(regionId));
  const [hydrated, setHydrated] = useState(!enabled);
  const [message, setMessage] = useState("");
  const normalizedSurfaceLimit = surfaceAddLimit === undefined
    ? null
    : Math.max(1, Math.min(MAX_SELECTED_ITINERARY_PLACES, Math.floor(surfaceAddLimit)));

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const stored = loadSelectedItinerary(storage);
      setSnapshot(stored && (stored.regionId === regionId || stored.places.length > 0)
        ? stored
        : createSelectedItinerarySnapshot(regionId));
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [enabled, regionId, storage]);

  const persist = useCallback((
    nextSnapshot: SelectedItinerarySnapshot,
    successMessage: string,
  ) => {
    setSnapshot(nextSnapshot);
    setMessage(saveSelectedItinerary(nextSnapshot, storage)
      ? successMessage
      : SAVE_ERROR_MESSAGE);
  }, [storage]);

  const remove = useCallback((placeId: string) => {
    const selectedPlace = snapshot.places.find(({ id }) => id === placeId);
    const nextSnapshot = removeSelectedItineraryPlace(snapshot, placeId);
    persist(
      nextSnapshot,
      selectedPlace
        ? `${selectedPlace.name}을(를) 일정에서 뺐습니다.`
        : "장소를 일정에서 뺐습니다.",
    );
  }, [persist, snapshot]);

  const toggle = useCallback((place: SelectedItineraryPlace): SelectedItineraryToggleResult => {
    if (snapshot.places.some(({ id }) => id === place.id)) {
      const nextSnapshot = removeSelectedItineraryPlace(snapshot, place.id);
      persist(nextSnapshot, `${place.name}을(를) 일정에서 뺐습니다.`);
      return { status: "removed", snapshot: nextSnapshot };
    }

    const result = addSelectedItineraryPlace(snapshot, place);
    if (
      normalizedSurfaceLimit !== null &&
      snapshot.places.length >= normalizedSurfaceLimit &&
      (result.status === "selected" || result.status === "limit_reached")
    ) {
      setMessage(`이 화면에서는 최대 ${normalizedSurfaceLimit}곳까지 담을 수 있습니다.`);
      return { status: "surface_limit_reached", snapshot };
    }
    if (result.status === "selected") {
      persist(result.snapshot, `${place.name}을(를) 일정에 담았습니다.`);
      return result;
    }

    setMessage(blockedSelectionMessage(result.status));
    return result;
  }, [normalizedSurfaceLimit, persist, snapshot]);

  const move = useCallback((
    placeId: string,
    direction: SelectedItineraryMoveDirection,
  ): boolean => {
    const currentIndex = snapshot.places.findIndex(({ id }) => id === placeId);
    const nextIndex = direction === "forward" ? currentIndex - 1 : currentIndex + 1;
    if (
      currentIndex < 0 ||
      nextIndex < 0 ||
      nextIndex >= snapshot.places.length
    ) {
      return false;
    }

    const places = [...snapshot.places];
    [places[currentIndex], places[nextIndex]] = [places[nextIndex]!, places[currentIndex]!];
    const nextSnapshot = { ...snapshot, places };
    const place = places[nextIndex]!;
    persist(
      nextSnapshot,
      `${place.name}을(를) ${direction === "forward" ? "앞으로" : "뒤로"} 이동했습니다. 현재 ${nextIndex + 1}번째입니다.`,
    );
    return true;
  }, [persist, snapshot]);

  const setAutoFill = useCallback((enabled: boolean) => {
    const supported = getRegionConfig(snapshot.regionId).routeCapabilities.automaticFill;
    persist(
      { ...snapshot, autoFill: supported && enabled },
      supported && enabled
        ? "부족한 장소를 WEEKENDOG가 추천하도록 설정했습니다."
        : "선택한 장소만으로 일정을 만듭니다.",
    );
  }, [persist, snapshot]);

  const setIncludeVerificationRequired = useCallback((enabled: boolean) => {
    persist(
      { ...snapshot, includeVerificationRequired: enabled },
      enabled
        ? "확인이 필요한 자동 후보도 포함합니다."
        : "확인된 자동 후보만 사용합니다.",
    );
  }, [persist, snapshot]);

  const resetRegion = useCallback((
    nextRegionId: RegionId,
    options?: { preserveAutoFill?: boolean; message?: string },
  ) => {
    const nextSnapshot = createSelectedItinerarySnapshot(nextRegionId);
    if (options?.preserveAutoFill) {
      nextSnapshot.autoFill = nextSnapshot.autoFill && snapshot.autoFill;
    }
    persist(nextSnapshot, options?.message ?? "");
  }, [persist, snapshot.autoFill]);

  return useMemo(() => ({
    snapshot,
    hydrated,
    message,
    toggle,
    remove,
    move,
    setAutoFill,
    setIncludeVerificationRequired,
    resetRegion,
  }), [hydrated, message, move, remove, resetRegion, setAutoFill, setIncludeVerificationRequired, snapshot, toggle]);
}
