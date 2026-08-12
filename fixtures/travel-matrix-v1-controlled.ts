import type { TravelMatrixInput, TravelNode } from "@/lib/travel/types";

export interface ControlledTravelMatrixScenario {
  id: string;
  input: TravelMatrixInput;
  missingMultiDestinationIds: string[];
}

const origin: TravelNode = {
  id: "synthetic-origin",
  kind: "departure",
  name: "Synthetic Busan origin",
  latitude: 35.1796,
  longitude: 129.0756,
};

function candidate(index: number, far = false): TravelNode {
  return {
    id: `synthetic-place-${String(index).padStart(2, "0")}`,
    kind: "place",
    name: `Synthetic place ${index}`,
    latitude: far ? 35.36 + index * 0.002 : 35.1796 + index * 0.002,
    longitude: far ? 129.24 + index * 0.002 : 129.0756 + index * 0.002,
  };
}

function scenario(
  id: string,
  count: number,
  options: { farFrom?: number; missing?: number[] } = {},
): ControlledTravelMatrixScenario {
  return {
    id,
    input: {
      departure: origin,
      candidates: Array.from({ length: count }, (_, index) =>
        candidate(index + 1, (options.farFrom ?? Number.POSITIVE_INFINITY) <= index + 1),
      ),
      travelMode: "driving",
      priority: "TIME",
      avoid: [],
      requestedDepartureAt: null,
    },
    missingMultiDestinationIds: (options.missing ?? []).map(
      (index) => `synthetic-place-${String(index).padStart(2, "0")}`,
    ),
  };
}

export const CONTROLLED_TRAVEL_MATRIX_AS_OF =
  "2026-08-12T03:00:00.000Z" as const;

export const CONTROLLED_TRAVEL_MATRIX_SCENARIOS: ControlledTravelMatrixScenario[] = [
  scenario("three_candidates", 3),
  scenario("five_candidates", 5),
  scenario("six_candidates", 6),
  scenario("fifteen_candidates", 15),
  scenario("mixed_radius", 6, { farFrom: 4 }),
  scenario("partial_multi_destination", 5, { missing: [2, 5] }),
];

