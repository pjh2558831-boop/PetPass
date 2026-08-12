import "server-only";

import type { TourContentTypeId } from "@/types/place";

export const DWELL_DURATION_V1_CONFIG = {
  version: "dwell-duration-v1",
  defaultsMinutes: {
    "12": 90,
    "14": 90,
    "15": 120,
    "28": 120,
    "32": 30,
    "38": 60,
    "39": 75,
    cafe_rest: 60,
  },
} as const;

export type DwellDurationV1Category = TourContentTypeId | "cafe_rest";

export interface DwellDurationV1Result {
  version: "dwell-duration-v1";
  minutes: number;
  source: "provider" | "default";
  defaultUsed: boolean;
  category: DwellDurationV1Category;
}

export function resolveDwellDurationV1(input: {
  category: DwellDurationV1Category;
  providerDurationMinutes?: number | null;
  providerDurationReliable?: boolean;
}): DwellDurationV1Result {
  const providerDuration = input.providerDurationMinutes;
  const useProvider =
    input.providerDurationReliable === true &&
    typeof providerDuration === "number" &&
    Number.isInteger(providerDuration) &&
    providerDuration > 0;
  return {
    version: DWELL_DURATION_V1_CONFIG.version,
    minutes: useProvider
      ? providerDuration
      : DWELL_DURATION_V1_CONFIG.defaultsMinutes[input.category],
    source: useProvider ? "provider" : "default",
    defaultUsed: !useProvider,
    category: input.category,
  };
}
