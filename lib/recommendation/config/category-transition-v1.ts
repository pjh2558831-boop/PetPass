import "server-only";

import type { RouteVisitRole } from "@/lib/recommendation/types/route-optimizer";

export const CATEGORY_TRANSITION_V1_CONFIG = {
  version: "category-transition-v1",
  bonuses: {
    "activity:meal": 50,
    "activity:rest": 60,
    "meal:activity": 30,
    "rest:activity": 35,
    "activity:accommodation": 50,
    "meal:accommodation": 40,
  } as Readonly<Record<string, number>>,
} as const;

export function categoryTransitionBonusV1(
  from: RouteVisitRole | null,
  to: RouteVisitRole,
  input: { overnight: boolean; toIsFinal: boolean },
): { bonus: number; reasonCode: string | null } {
  if (!from) return { bonus: 0, reasonCode: null };
  if (
    to === "accommodation" &&
    (!input.overnight || !input.toIsFinal)
  ) {
    return { bonus: 0, reasonCode: null };
  }
  const key = `${from}:${to}`;
  const bonus = CATEGORY_TRANSITION_V1_CONFIG.bonuses[key] ?? 0;
  return {
    bonus,
    reasonCode: bonus > 0 ? `transition_${from}_to_${to}` : null,
  };
}

