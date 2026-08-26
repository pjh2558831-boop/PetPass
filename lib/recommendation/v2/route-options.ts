import "server-only";

import { PERSONALIZATION_V2_CONFIG } from "@/lib/recommendation/config/personalization-v2";

export const ROUTE_STYLE_IDS_V2 = ["comfort", "preference", "efficient"] as const;

export type RouteStyleIdV2 = (typeof ROUTE_STYLE_IDS_V2)[number];

export interface RouteStyleSelectionCandidateV2 {
  signature: string;
  orderedPlaceIds: readonly string[];
  totalDrivingSeconds: number;
  totalDistanceMeters: number;
  maximumLegSeconds: number;
  categoryCount: number;
  unknownScheduleCount: number;
  styleScores: Readonly<Record<RouteStyleIdV2, number>>;
}

export interface RouteStyleOptionV2<
  TRoute extends RouteStyleSelectionCandidateV2 = RouteStyleSelectionCandidateV2,
> {
  style: RouteStyleIdV2;
  route: TRoute;
}

export interface RouteStyleSelectionResultV2<
  TRoute extends RouteStyleSelectionCandidateV2 = RouteStyleSelectionCandidateV2,
> {
  options: RouteStyleOptionV2<TRoute>[];
  alternativeAvailability: "available" | "limited";
}

interface RankedCandidate<TRoute extends RouteStyleSelectionCandidateV2> {
  route: TRoute;
  recentPenalty: number;
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

function countSharedPlaces(
  route: RouteStyleSelectionCandidateV2,
  selected: readonly RouteStyleSelectionCandidateV2[],
): number {
  const selectedIds = new Set(selected.flatMap(({ orderedPlaceIds }) => orderedPlaceIds));
  return route.orderedPlaceIds.reduce(
    (count, placeId) => count + (selectedIds.has(placeId) ? 1 : 0),
    0,
  );
}

function countSharedDirectedLegs(
  route: RouteStyleSelectionCandidateV2,
  selected: readonly RouteStyleSelectionCandidateV2[],
): number {
  const selectedLegs = new Set(selected.flatMap(({ orderedPlaceIds }) =>
    orderedPlaceIds.slice(1).map((placeId, index) => `${orderedPlaceIds[index]}>${placeId}`)));
  return route.orderedPlaceIds.slice(1).reduce(
    (count, placeId, index) =>
      count + (selectedLegs.has(`${route.orderedPlaceIds[index]}>${placeId}`) ? 1 : 0),
    0,
  );
}

function compareRanked<TRoute extends RouteStyleSelectionCandidateV2>(
  style: RouteStyleIdV2,
  left: RankedCandidate<TRoute>,
  right: RankedCandidate<TRoute>,
): number {
  if (style === "efficient") {
    return (
      left.recentPenalty - right.recentPenalty ||
      left.route.totalDrivingSeconds - right.route.totalDrivingSeconds ||
      left.route.totalDistanceMeters - right.route.totalDistanceMeters ||
      left.diversityPenalty - right.diversityPenalty ||
      right.route.styleScores.efficient - left.route.styleScores.efficient ||
      left.tieBreak - right.tieBreak ||
      left.route.signature.localeCompare(right.route.signature)
    );
  }

  const leftScore = left.route.styleScores[style] - left.recentPenalty -
    left.diversityPenalty + left.categoryCoverageBonus + left.explorationAdjustment;
  const rightScore = right.route.styleScores[style] - right.recentPenalty -
    right.diversityPenalty + right.categoryCoverageBonus + right.explorationAdjustment;
  return (
    rightScore - leftScore ||
    left.route.totalDrivingSeconds - right.route.totalDrivingSeconds ||
    left.tieBreak - right.tieBreak ||
    left.route.signature.localeCompare(right.route.signature)
  );
}

/**
 * Selects genuinely distinct route presentations from one already-generated
 * route pool. It never performs provider work and is deterministic for the
 * same pool, recent-history set, and reroll variant.
 */
export function selectRouteStyleOptionsV2<
  TRoute extends RouteStyleSelectionCandidateV2,
>(input: {
  routes: readonly TRoute[];
  recentRouteSignatures: readonly string[];
  rerollVariant: number;
}): RouteStyleSelectionResultV2<TRoute> {
  const recentSignatures = new Set(input.recentRouteSignatures);
  const uniqueRoutes = [...new Map(input.routes.map((route) => [route.signature, route])).values()];
  const selected: TRoute[] = [];
  const options: RouteStyleOptionV2<TRoute>[] = [];

  for (const style of ROUTE_STYLE_IDS_V2) {
    const remaining = uniqueRoutes.filter(
      (route) => !selected.some(({ signature }) => signature === route.signature),
    );
    if (remaining.length === 0) {
      break;
    }

    const ranked = remaining
      .map((route): RankedCandidate<TRoute> => {
        const tieBreak = stableHash(`${input.rerollVariant}:${style}:${route.signature}`);
        return {
          route,
          recentPenalty: recentSignatures.has(route.signature)
            ? PERSONALIZATION_V2_CONFIG.routeDiversity.recentSignaturePenalty
            : 0,
          diversityPenalty:
            countSharedPlaces(route, selected) *
              PERSONALIZATION_V2_CONFIG.routeDiversity.candidateOverlapPenalty +
            countSharedDirectedLegs(route, selected) *
              PERSONALIZATION_V2_CONFIG.routeDiversity.orderOverlapPenalty,
          categoryCoverageBonus:
            route.categoryCount *
            PERSONALIZATION_V2_CONFIG.routeDiversity.categoryCoverageBonus,
          explorationAdjustment: input.rerollVariant > 0 ? tieBreak % 41 : 0,
          tieBreak,
        };
      })
      .sort((left, right) => compareRanked(style, left, right));

    const winner = ranked[0]!.route;
    selected.push(winner);
    options.push({ style, route: winner });
  }

  return {
    options,
    alternativeAvailability: options.length === ROUTE_STYLE_IDS_V2.length ? "available" : "limited",
  };
}
