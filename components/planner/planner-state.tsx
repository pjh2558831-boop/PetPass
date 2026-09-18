"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { REGION_CONFIGS } from "@/lib/regions/config";
import type { PetProfile, TravelPreferences } from "@/types/pet";
import type {
  GeneratedItinerary,
  ItineraryGenerationResponse,
} from "@/types/route-generation";

export const DEFAULT_PLANNER_PROFILE: PetProfile = {
  id: "latest-pet",
  name: "",
  species: "DOG",
  size: "SMALL",
  hasCarrier: null,
  hasLeash: null,
  hasMuzzle: null,
  acceptsOutdoorOnly: null,
};

const DEFAULT_PLANNER_REGION = REGION_CONFIGS.find(
  ({ routeCapabilities }) => routeCapabilities.fullyAutomaticRecommendation,
) ?? REGION_CONFIGS[0];

export const DEFAULT_PLANNER_PREFERENCES: TravelPreferences = {
  regionCode:
    DEFAULT_PLANNER_REGION.providerCodes.korPetTourService2.legalDongRegionCode,
  regionName: DEFAULT_PLANNER_REGION.displayName,
  tripDate: "",
  tripType: "DAY_TRIP",
  tripPace: "balanced",
  startTime: "",
  preferredCategories: [],
  planningMode: "stop_count",
  desiredStopCount: 3,
  desiredDurationMinutes: 360,
  environmentPreference: "any",
  includeShopping: false,
  roundTrip: false,
  recommendationBasis: "departure",
};

export type PlannerGenerationPhase = "idle" | "loading" | "ready" | "error";

export type PlannerGenerationOperation = "initial" | "reroll";

export interface PlannerGenerationState {
  phase: PlannerGenerationPhase;
  operation: PlannerGenerationOperation | null;
  response: ItineraryGenerationResponse | null;
  selectedItineraryId: string | null;
  recentRouteSignatures: string[];
  error: string | null;
  activeRequestId: number;
}

export interface PlannerStateValue {
  profile: PetProfile;
  setProfile: Dispatch<SetStateAction<PetProfile>>;
  preferences: TravelPreferences;
  setPreferences: Dispatch<SetStateAction<TravelPreferences>>;
  profileConfirmed: boolean;
  preferencesConfirmed: boolean;
  generationRequested: boolean;
  generationState: PlannerGenerationState;
  selectedItinerary: GeneratedItinerary | null;
  confirmProfile: () => void;
  confirmPreferencesAndRequestGeneration: () => void;
  confirmPlannerAndRequestGeneration: (
    profile: PetProfile,
    preferences: TravelPreferences,
  ) => void;
  consumeGenerationRequest: () => void;
  beginGeneration: (operation: PlannerGenerationOperation) => number;
  resolveGeneration: (
    requestId: number,
    response: ItineraryGenerationResponse,
  ) => void;
  rejectGeneration: (requestId: number, error: string) => void;
  selectItinerary: (itineraryId: string) => void;
  invalidateGeneration: () => void;
}

const PlannerStateContext = createContext<PlannerStateValue | null>(null);

const MAX_RECENT_ROUTE_SIGNATURES = 12;

function createIdleGenerationState(activeRequestId: number): PlannerGenerationState {
  return {
    phase: "idle",
    operation: null,
    response: null,
    selectedItineraryId: null,
    recentRouteSignatures: [],
    error: null,
    activeRequestId,
  };
}

function mergeRouteSignatures(
  currentSignatures: string[],
  response: ItineraryGenerationResponse,
): string[] {
  return Array.from(
    new Set([
      ...currentSignatures,
      ...response.itineraries.map((itinerary) => itinerary.signature),
    ]),
  ).slice(-MAX_RECENT_ROUTE_SIGNATURES);
}

export function PlannerStateProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState(DEFAULT_PLANNER_PROFILE);
  const [preferences, setPreferencesState] = useState(DEFAULT_PLANNER_PREFERENCES);
  const [profileConfirmed, setProfileConfirmed] = useState(false);
  const [preferencesConfirmed, setPreferencesConfirmed] = useState(false);
  const [generationRequested, setGenerationRequested] = useState(false);
  const [generationState, setGenerationState] = useState<PlannerGenerationState>(
    () => createIdleGenerationState(0),
  );
  const generationRequestSequence = useRef(0);

  const invalidateGeneration = useCallback(() => {
    const activeRequestId = ++generationRequestSequence.current;
    setGenerationState(() => createIdleGenerationState(activeRequestId));
  }, []);

  const beginGeneration = useCallback(
    (operation: PlannerGenerationOperation): number => {
      const activeRequestId = ++generationRequestSequence.current;

      setGenerationState((current) => {
        if (operation === "initial") {
          return {
            ...createIdleGenerationState(activeRequestId),
            phase: "loading",
            operation,
          };
        }

        return {
          ...current,
          phase: "loading",
          operation,
          error: null,
          activeRequestId,
        };
      });

      return activeRequestId;
    },
    [],
  );

  const resolveGeneration = useCallback(
    (requestId: number, response: ItineraryGenerationResponse) => {
      setGenerationState((current) => {
        if (requestId !== current.activeRequestId) {
          return current;
        }

        return {
          phase: "ready",
          operation: null,
          response,
          selectedItineraryId: response.itineraries[0]?.id ?? null,
          recentRouteSignatures: mergeRouteSignatures(
            current.recentRouteSignatures,
            response,
          ),
          error: null,
          activeRequestId: requestId,
        };
      });
    },
    [],
  );

  const rejectGeneration = useCallback(
    (requestId: number, error: string) => {
      setGenerationState((current) => {
        if (requestId !== current.activeRequestId) {
          return current;
        }

        return {
          ...current,
          phase: "error",
          operation: null,
          error,
        };
      });
    },
    [],
  );

  const selectItinerary = useCallback((itineraryId: string) => {
    setGenerationState((current) => {
      if (
        current.selectedItineraryId === itineraryId ||
        !current.response?.itineraries.some(
          (itinerary) => itinerary.id === itineraryId,
        )
      ) {
        return current;
      }

      return {
        ...current,
        selectedItineraryId: itineraryId,
      };
    });
  }, []);

  const setProfile: Dispatch<SetStateAction<PetProfile>> = useCallback((action) => {
    setProfileState((current) =>
      typeof action === "function" ? action(current) : action,
    );
    setProfileConfirmed(false);
    setPreferencesConfirmed(false);
    setGenerationRequested(false);
    invalidateGeneration();
  }, [invalidateGeneration]);

  const setPreferences: Dispatch<SetStateAction<TravelPreferences>> = useCallback(
    (action) => {
      setPreferencesState((current) =>
        typeof action === "function" ? action(current) : action,
      );
      setPreferencesConfirmed(false);
      setGenerationRequested(false);
      invalidateGeneration();
    },
    [invalidateGeneration],
  );

  const confirmProfile = useCallback(() => {
    setProfileConfirmed(true);
    setPreferencesConfirmed(false);
    setGenerationRequested(false);
    invalidateGeneration();
  }, [invalidateGeneration]);

  const confirmPreferencesAndRequestGeneration = useCallback(() => {
    setPreferencesConfirmed(true);
    setGenerationRequested(true);
    invalidateGeneration();
  }, [invalidateGeneration]);

  const confirmPlannerAndRequestGeneration = useCallback(
    (nextProfile: PetProfile, nextPreferences: TravelPreferences) => {
      const activeRequestId = ++generationRequestSequence.current;
      setProfileState(nextProfile);
      setPreferencesState({
        ...nextPreferences,
        environmentPreference: nextPreferences.environmentPreference ?? "any",
      });
      setProfileConfirmed(true);
      setPreferencesConfirmed(true);
      setGenerationRequested(true);
      setGenerationState(() => createIdleGenerationState(activeRequestId));
    },
    [],
  );

  const consumeGenerationRequest = useCallback(() => {
    setGenerationRequested(false);
  }, []);

  const selectedItinerary =
    generationState.response?.itineraries.find(
      (itinerary) => itinerary.id === generationState.selectedItineraryId,
    ) ?? null;

  const value = useMemo(
    () => ({
      profile,
      setProfile,
      preferences,
      setPreferences,
      profileConfirmed,
      preferencesConfirmed,
      generationRequested,
      generationState,
      selectedItinerary,
      confirmProfile,
      confirmPreferencesAndRequestGeneration,
      confirmPlannerAndRequestGeneration,
      consumeGenerationRequest,
      beginGeneration,
      resolveGeneration,
      rejectGeneration,
      selectItinerary,
      invalidateGeneration,
    }),
    [
      beginGeneration,
      confirmPreferencesAndRequestGeneration,
      confirmPlannerAndRequestGeneration,
      confirmProfile,
      consumeGenerationRequest,
      generationRequested,
      generationState,
      invalidateGeneration,
      preferences,
      preferencesConfirmed,
      profile,
      profileConfirmed,
      rejectGeneration,
      resolveGeneration,
      selectItinerary,
      selectedItinerary,
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
