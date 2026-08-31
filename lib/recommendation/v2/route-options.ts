import "server-only";

import { ROUTE_COMPOSITION_V2_CONFIG } from "@/lib/recommendation/config/route-composition-v2";

export const ROUTE_STYLE_IDS_V2 = ["balanced", "shortest", "relaxed"] as const;
export type RouteStyleIdV2 = (typeof ROUTE_STYLE_IDS_V2)[number];

export interface RouteStyleSelectionCandidateV2 {
  signature: string;
  orderedPlaceIds: readonly string[];
  totalDrivingSeconds: number;
  totalDistanceMeters: number;
  totalWaitSeconds: number;
  maximumLegSeconds: number;
  maximumSingleWaitSeconds: number;
  categoryCount: number;
  categorySignature: string;
  unknownScheduleCount: number;
  styleScores: Readonly<Record<RouteStyleIdV2, number>>;
}

export interface RouteStyleOptionV2<TRoute extends RouteStyleSelectionCandidateV2 = RouteStyleSelectionCandidateV2> {
  style: RouteStyleIdV2;
  route: TRoute;
  differenceExplanationCodes: string[];
}

export interface RouteStyleSelectionResultV2<TRoute extends RouteStyleSelectionCandidateV2 = RouteStyleSelectionCandidateV2> {
  options: RouteStyleOptionV2<TRoute>[];
  alternativeAvailability: "available" | "limited";
  limitedReason: "fewer_than_three_meaningfully_distinct_routes" | null;
}

interface RankedCandidate<TRoute extends RouteStyleSelectionCandidateV2> {
  route: TRoute;
  historyPenalty: number;
  diversityPenalty: number;
  categoryCoverageBonus: number;
  explorationAdjustment: number;
  tieBreak: number;
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function directedLegs(route: RouteStyleSelectionCandidateV2): Set<string> {
  return new Set(route.orderedPlaceIds.slice(1).map((id, index) => `${route.orderedPlaceIds[index]}>${id}`));
}

function countSharedPlaces(route: RouteStyleSelectionCandidateV2, selected: readonly RouteStyleSelectionCandidateV2[]): number {
  const selectedIds = new Set(selected.flatMap(({ orderedPlaceIds }) => [...orderedPlaceIds]));
  return route.orderedPlaceIds.filter((id) => selectedIds.has(id)).length;
}

function countSharedDirectedLegs(route: RouteStyleSelectionCandidateV2, selected: readonly RouteStyleSelectionCandidateV2[]): number {
  const selectedLegs = new Set(selected.flatMap((item) => [...directedLegs(item)]));
  return [...directedLegs(route)].filter((leg) => selectedLegs.has(leg)).length;
}

function firstAutomaticPlaceId(route: RouteStyleSelectionCandidateV2, locked: ReadonlySet<string>): string | null {
  return route.orderedPlaceIds.find((id) => !locked.has(id)) ?? null;
}

function differenceCodes(route: RouteStyleSelectionCandidateV2, prior: readonly RouteStyleSelectionCandidateV2[]): string[] {
  if (prior.length === 0) return ["primary_balanced_objective"];
  const codes = new Set<string>();
  if (prior.some((item) => item.signature !== route.signature)) codes.add("different_places_or_order");
  if (prior.some((item) => item.totalDrivingSeconds !== route.totalDrivingSeconds)) codes.add("different_travel_time");
  if (prior.some((item) => item.totalWaitSeconds !== route.totalWaitSeconds)) codes.add("different_wait_time");
  if (prior.some((item) => item.categorySignature !== route.categorySignature)) codes.add("different_category_composition");
  return [...codes];
}

function compareRanked<TRoute extends RouteStyleSelectionCandidateV2>(
  style: RouteStyleIdV2,
  left: RankedCandidate<TRoute>,
  right: RankedCandidate<TRoute>,
): number {
  if (style === "shortest") {
    return left.historyPenalty - right.historyPenalty ||
      left.route.totalDrivingSeconds - right.route.totalDrivingSeconds ||
      left.route.totalDistanceMeters - right.route.totalDistanceMeters ||
      left.route.totalWaitSeconds - right.route.totalWaitSeconds ||
      left.diversityPenalty - right.diversityPenalty ||
      left.tieBreak - right.tieBreak || left.route.signature.localeCompare(right.route.signature);
  }
  const leftScore = left.route.styleScores[style] - left.historyPenalty - left.diversityPenalty +
    left.categoryCoverageBonus + left.explorationAdjustment;
  const rightScore = right.route.styleScores[style] - right.historyPenalty - right.diversityPenalty +
    right.categoryCoverageBonus + right.explorationAdjustment;
  return rightScore - leftScore ||
    (style === "relaxed" ? left.route.maximumSingleWaitSeconds - right.route.maximumSingleWaitSeconds : 0) ||
    (style === "relaxed" ? left.route.maximumLegSeconds - right.route.maximumLegSeconds : 0) ||
    left.route.totalDrivingSeconds - right.route.totalDrivingSeconds ||
    left.tieBreak - right.tieBreak || left.route.signature.localeCompare(right.route.signature);
}

export function selectRouteStyleOptionsV2<TRoute extends RouteStyleSelectionCandidateV2>(input: {
  routes: readonly TRoute[];
  recentRouteSignatures: readonly string[];
  recentlySelectedCandidateIds?: readonly string[];
  lockedPlaceIds?: readonly string[];
  deterministicSeed?: string;
  rerollVariant: number;
}): RouteStyleSelectionResultV2<TRoute> {
  const cfg = ROUTE_COMPOSITION_V2_CONFIG.routeOptions;
  const recentSignatures = new Set(input.recentRouteSignatures);
  const recentPlaces = new Set(input.recentlySelectedCandidateIds ?? []);
  const locked = new Set(input.lockedPlaceIds ?? []);
  const recentFirstAutomatic = new Set(input.recentRouteSignatures.map((signature) =>
    signature.split(">").find((id) => !locked.has(id))).filter((id): id is string => Boolean(id)));
  const uniqueRoutes = [...new Map(input.routes.map((route) => [route.signature, route])).values()];
  const commonPlaceIds = new Set(uniqueRoutes[0]?.orderedPlaceIds ?? []);
  for (const route of uniqueRoutes.slice(1)) {
    for (const id of [...commonPlaceIds]) if (!route.orderedPlaceIds.includes(id)) commonPlaceIds.delete(id);
  }
  const selected: TRoute[] = [];
  const options: RouteStyleOptionV2<TRoute>[] = [];

  for (const style of ROUTE_STYLE_IDS_V2) {
    const remaining = uniqueRoutes.filter((route) => !selected.some(({ signature }) => signature === route.signature));
    if (remaining.length === 0) break;
    const ranked = remaining.map((route): RankedCandidate<TRoute> => {
      const firstAutomatic = firstAutomaticPlaceId(route, locked);
      const historyPenalty =
        (recentSignatures.has(route.signature) ? cfg.recentSignaturePenalty : 0) +
        (firstAutomatic && recentFirstAutomatic.has(firstAutomatic) ? cfg.recentFirstAutomaticStopPenalty : 0) +
        route.orderedPlaceIds.reduce((sum, id) => sum +
          (!locked.has(id) && !commonPlaceIds.has(id) && recentPlaces.has(id) ? cfg.recentAutomaticPlacePenalty : 0), 0);
      const tieBreak = stableHash(`${input.deterministicSeed ?? "route-v2"}:${input.rerollVariant}:${style}:${route.signature}`);
      return {
        route, historyPenalty,
        diversityPenalty: countSharedPlaces(route, selected) * cfg.selectedOptionPlaceOverlapPenalty +
          countSharedDirectedLegs(route, selected) * cfg.selectedOptionOrderOverlapPenalty,
        categoryCoverageBonus: route.categoryCount * cfg.categoryCoverageBonus,
        explorationAdjustment: input.rerollVariant > 0 ? tieBreak % 61 : 0,
        tieBreak,
      };
    }).sort((left, right) => compareRanked(style, left, right));
    const winner = ranked[0]!.route;
    options.push({ style, route: winner, differenceExplanationCodes: differenceCodes(winner, selected) });
    selected.push(winner);
  }
  const available = options.length === ROUTE_STYLE_IDS_V2.length;
  return {
    options,
    alternativeAvailability: available ? "available" : "limited",
    limitedReason: available ? null : "fewer_than_three_meaningfully_distinct_routes",
  };
}
