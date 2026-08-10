"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { BUSAN_REGION } from "@/lib/tour-api/catalog";
import type { PetProfile, TravelPreferences } from "@/types/pet";

export const DEFAULT_PLANNER_PROFILE: PetProfile = {
  id: "latest-pet",
  name: "보리",
  species: "DOG",
  size: "SMALL",
  hasCarrier: true,
  hasLeash: true,
  hasMuzzle: false,
  acceptsOutdoorOnly: true,
};

export const DEFAULT_PLANNER_PREFERENCES: TravelPreferences = {
  regionCode: BUSAN_REGION.code,
  regionName: BUSAN_REGION.name,
  tripDate: "2026-08-15",
  tripType: "DAY_TRIP",
  startTime: "10:00",
  preferredCategories: ["ATTRACTION", "RESTAURANT", "CAFE"],
  planningMode: "stop_count",
  desiredStopCount: 3,
  desiredDurationMinutes: 360,
  indoorAccessPreference: "any",
  includeShopping: false,
};

interface PlannerStateValue {
  profile: PetProfile;
  setProfile: Dispatch<SetStateAction<PetProfile>>;
  preferences: TravelPreferences;
  setPreferences: Dispatch<SetStateAction<TravelPreferences>>;
  profileConfirmed: boolean;
  preferencesConfirmed: boolean;
  generationRequested: boolean;
  confirmProfile: () => void;
  confirmPreferencesAndRequestGeneration: () => void;
  consumeGenerationRequest: () => void;
}

const PlannerStateContext = createContext<PlannerStateValue | null>(null);

export function PlannerStateProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState(DEFAULT_PLANNER_PROFILE);
  const [preferences, setPreferencesState] = useState(DEFAULT_PLANNER_PREFERENCES);
  const [profileConfirmed, setProfileConfirmed] = useState(false);
  const [preferencesConfirmed, setPreferencesConfirmed] = useState(false);
  const [generationRequested, setGenerationRequested] = useState(false);

  const setProfile: Dispatch<SetStateAction<PetProfile>> = useCallback((action) => {
    setProfileState((current) =>
      typeof action === "function" ? action(current) : action,
    );
    setProfileConfirmed(false);
    setPreferencesConfirmed(false);
    setGenerationRequested(false);
  }, []);

  const setPreferences: Dispatch<SetStateAction<TravelPreferences>> = useCallback(
    (action) => {
      setPreferencesState((current) =>
        typeof action === "function" ? action(current) : action,
      );
      setPreferencesConfirmed(false);
      setGenerationRequested(false);
    },
    [],
  );

  const confirmProfile = useCallback(() => {
    if (!profile.acceptsOutdoorOnly) {
      setPreferencesState((current) => ({
        ...current,
        indoorAccessPreference: "required",
      }));
    }
    setProfileConfirmed(true);
    setPreferencesConfirmed(false);
    setGenerationRequested(false);
  }, [profile.acceptsOutdoorOnly]);

  const confirmPreferencesAndRequestGeneration = useCallback(() => {
    setPreferencesConfirmed(true);
    setGenerationRequested(true);
  }, []);

  const consumeGenerationRequest = useCallback(() => {
    setGenerationRequested(false);
  }, []);

  const value = useMemo(
    () => ({
      profile,
      setProfile,
      preferences,
      setPreferences,
      profileConfirmed,
      preferencesConfirmed,
      generationRequested,
      confirmProfile,
      confirmPreferencesAndRequestGeneration,
      consumeGenerationRequest,
    }),
    [
      confirmPreferencesAndRequestGeneration,
      confirmProfile,
      consumeGenerationRequest,
      generationRequested,
      preferences,
      preferencesConfirmed,
      profile,
      profileConfirmed,
      setPreferences,
      setProfile,
    ],
  );

  return (
    <PlannerStateContext.Provider value={value}>
      {children}
    </PlannerStateContext.Provider>
  );
}

export function usePlannerState(): PlannerStateValue {
  const value = useContext(PlannerStateContext);
  if (!value) {
    throw new Error("usePlannerState must be used within PlannerStateProvider");
  }
  return value;
}
