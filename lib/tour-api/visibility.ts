import "server-only";

import type { ProviderVisibilityResult } from "@/types/place";

export type { ProviderVisibility, ProviderVisibilityResult } from "@/types/place";

export const TOUR_VISIBILITY_PROVIDER_FIELD = "showflag" as const;
export const TOUR_VISIBILITY_PROVIDER_PAGE_SIZE = 50;
export const TOUR_VISIBILITY_MAX_PAGES = 20;

function normalizedProviderValue(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized === "" ? null : normalized;
}

export function normalizeProviderVisibility(
  showflag: unknown,
  checkedAt = new Date().toISOString(),
): ProviderVisibilityResult {
  const providerValue = normalizedProviderValue(showflag);

  if (providerValue === "1") {
    return {
      status: "exposed",
      providerField: TOUR_VISIBILITY_PROVIDER_FIELD,
      providerValue,
      checkedAt,
      reasonCodes: [],
    };
  }

  if (providerValue === "0") {
    return {
      status: "not_exposed",
      providerField: TOUR_VISIBILITY_PROVIDER_FIELD,
      providerValue,
      checkedAt,
      reasonCodes: ["provider_visibility_not_exposed"],
    };
  }

  return {
    status: "unknown",
    providerField: providerValue === null ? null : TOUR_VISIBILITY_PROVIDER_FIELD,
    providerValue,
    checkedAt,
    reasonCodes: [
      providerValue === null
        ? "provider_visibility_field_missing"
        : "provider_visibility_value_undocumented",
    ],
  };
}

export function providerUnavailableVisibility(
  checkedAt = new Date().toISOString(),
  reasonCodes: string[] = ["provider_visibility_unavailable"],
): ProviderVisibilityResult {
  return {
    status: "provider_unavailable",
    providerField: TOUR_VISIBILITY_PROVIDER_FIELD,
    providerValue: null,
    checkedAt,
    reasonCodes: [...reasonCodes],
  };
}

export function normalizeProviderVisibilityFailure(
  _error: unknown,
  checkedAt = new Date().toISOString(),
): ProviderVisibilityResult {
  return providerUnavailableVisibility(checkedAt);
}
