import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PlannerStateProvider,
  usePlannerState,
  type PlannerStateValue,
} from "@/components/planner/planner-state";
import type {
  GeneratedItinerary,
  ItineraryGenerationResponse,
} from "@/types/route-generation";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let currentPlannerState: PlannerStateValue | null = null;
let container: HTMLDivElement;
let root: Root;

function StateProbe() {
  const plannerState = usePlannerState();

  useEffect(() => {
    currentPlannerState = plannerState;
  }, [plannerState]);

  return null;
}

function getPlannerState(): PlannerStateValue {
  if (!currentPlannerState) {
    throw new Error("Planner state is not mounted");
  }
  return currentPlannerState;
}

function createResponse(signatures: string[]): ItineraryGenerationResponse {
  return {
    itineraries: signatures.map(
      (signature, index) =>
        ({
          id: `route-${signature}-${index}`,
          signature,
        }) as GeneratedItinerary,
    ),
  } as ItineraryGenerationResponse;
}

beforeEach(() => {
  currentPlannerState = null;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root.render(
      createElement(PlannerStateProvider, null, createElement(StateProbe)),
    );
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  currentPlannerState = null;
});

describe("PlannerStateProvider generation state", () => {
  it("starts neutral and confirms the combined planner form atomically", () => {
    expect(getPlannerState().profile).toMatchObject({
      name: "",
      hasCarrier: false,
      hasLeash: false,
      hasMuzzle: false,
      acceptsOutdoorOnly: false,
    });
    expect(getPlannerState().preferences).toMatchObject({
      tripDate: "",
      startTime: "",
      preferredCategories: [],
    });

    const nextProfile = {
      ...getPlannerState().profile,
      name: "초코",
      species: "CAT" as const,
      size: "MEDIUM" as const,
    };
    const nextPreferences = {
      ...getPlannerState().preferences,
      tripDate: "2026-08-20",
      startTime: "09:30",
      preferredCategories: ["ATTRACTION" as const],
      departure: {
        label: "부산역",
        coordinates: { latitude: 35.1151, longitude: 129.0414 },
      },
    };

    act(() => {
      getPlannerState().confirmPlannerAndRequestGeneration(
        nextProfile,
        nextPreferences,
      );
    });

    expect(getPlannerState()).toMatchObject({
      profile: nextProfile,
      profileConfirmed: true,
      preferencesConfirmed: true,
      generationRequested: true,
    });
    expect(getPlannerState().preferences).toMatchObject({
      ...nextPreferences,
      indoorAccessPreference: "required",
    });
    expect(getPlannerState().generationState.phase).toBe("idle");
  });

  it("retains the old route during rerolls and caps unique server signatures", () => {
    let requestId = 0;
    act(() => {
      requestId = getPlannerState().beginGeneration("initial");
    });
    expect(getPlannerState().generationState).toMatchObject({
      phase: "loading",
      operation: "initial",
      response: null,
      selectedItineraryId: null,
      recentRouteSignatures: [],
      activeRequestId: requestId,
    });

    const firstResponse = createResponse(
      Array.from({ length: 10 }, (_, index) => `signature-${index + 1}`),
    );
    act(() => {
      getPlannerState().resolveGeneration(requestId, firstResponse);
    });
    expect(getPlannerState().generationState.selectedItineraryId).toBe(
      firstResponse.itineraries[0]?.id,
    );
    expect(getPlannerState().selectedItinerary).toBe(
      firstResponse.itineraries[0],
    );
    act(() => {
      getPlannerState().selectItinerary(firstResponse.itineraries[1]!.id);
    });
    expect(getPlannerState().selectedItinerary).toBe(
      firstResponse.itineraries[1],
    );

    let rerollRequestId = 0;
    act(() => {
      rerollRequestId = getPlannerState().beginGeneration("reroll");
    });
    expect(getPlannerState().generationState).toMatchObject({
      phase: "loading",
      operation: "reroll",
      response: firstResponse,
      selectedItineraryId: firstResponse.itineraries[1]?.id,
      activeRequestId: rerollRequestId,
    });

    const rerollResponse = createResponse(
      Array.from({ length: 7 }, (_, index) => `signature-${index + 9}`),
    );
    act(() => {
      getPlannerState().resolveGeneration(rerollRequestId, rerollResponse);
    });
    expect(getPlannerState().generationState.recentRouteSignatures).toEqual(
      Array.from({ length: 12 }, (_, index) => `signature-${index + 4}`),
    );
    expect(getPlannerState().selectedItinerary).toBe(
      rerollResponse.itineraries[0],
    );

    act(() => {
      getPlannerState().beginGeneration("initial");
    });
    expect(getPlannerState().generationState).toMatchObject({
      phase: "loading",
      operation: "initial",
      response: null,
      selectedItineraryId: null,
      recentRouteSignatures: [],
    });
  });

  it("ignores stale completions and invalidates routes when planner input changes", () => {
    let staleRequestId = 0;
    let activeRequestId = 0;
    act(() => {
      staleRequestId = getPlannerState().beginGeneration("initial");
      activeRequestId = getPlannerState().beginGeneration("initial");
    });

    act(() => {
      getPlannerState().resolveGeneration(
        staleRequestId,
        createResponse(["stale-signature"]),
      );
      getPlannerState().rejectGeneration(staleRequestId, "stale error");
    });
    expect(getPlannerState().generationState).toMatchObject({
      phase: "loading",
      response: null,
      error: null,
      activeRequestId,
    });

    const activeResponse = createResponse(["active-signature"]);
    act(() => {
      getPlannerState().resolveGeneration(activeRequestId, activeResponse);
    });
    expect(getPlannerState().selectedItinerary).toBe(
      activeResponse.itineraries[0],
    );

    act(() => {
      getPlannerState().setProfile((profile) => ({
        ...profile,
        name: "Changed pet",
      }));
    });
    expect(getPlannerState().generationState).toMatchObject({
      phase: "idle",
      response: null,
      selectedItineraryId: null,
      recentRouteSignatures: [],
      error: null,
    });
    expect(getPlannerState().generationState.activeRequestId).toBeGreaterThan(
      activeRequestId,
    );

    act(() => {
      getPlannerState().rejectGeneration(activeRequestId, "late error");
    });
    expect(getPlannerState().generationState.phase).toBe("idle");
    expect(getPlannerState().generationState.error).toBeNull();
  });
});
