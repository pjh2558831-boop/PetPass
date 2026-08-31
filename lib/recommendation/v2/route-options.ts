import "server-only";

import { ROUTE_COMPOSITION_V2_CONFIG } from "@/lib/recommendation/config/route-composition-v2";
import {
  analyzeRecommendationHistoryV2,
  stablePlaceSetSignatureV2,
} from "@/lib/recommendation/v2/novelty-history";

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
  limitedReason:
    | "fewer_than_three_meaningfully_distinct_routes"
    | "novelty_quota_unmet"
    | null;
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

function countSharedPlaces(
  route: RouteStyleSelectionCandidateV2,
  selected: readonly RouteStyleSelectionCandidateV2[],
  protectedIds: ReadonlySet<string>,
): number {
  const selectedIds = new Set(selected.flatMap(({ orderedPlaceIds }) => [...orderedPlaceIds]));
  return route.orderedPlaceIds.filter((id) => !protectedIds.has(id) && selectedIds.has(id)).length;
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
  protectedPlaceIds?: readonly string[];
  minimumNewAutomaticPlaces?: number;
  deterministicSeed?: string;
  rerollVariant: number;
}): RouteStyleSelectionResultV2<TRoute> {
  const cfg = ROUTE_COMPOSITION_V2_CONFIG.routeOptions;
  const locked = new Set(input.lockedPlaceIds ?? []);
  const protectedIds = new Set([...(input.protectedPlaceIds ?? []), ...locked]);
  const history = analyzeRecommendationHistoryV2({
    recentRouteSignatures: input.recentRouteSignatures,
    recentlySelectedCandidateIds: input.recentlySelectedCandidateIds ?? [],
    protectedPlaceIds: [...protectedIds],
  });
  const recentSignatures = new Set(history.orderedRouteSignatures);
  const recentPlaceSets = new Set(history.placeSetSignatures);
  const orderedUnique = [...new Map(input.routes.map((route) => [route.signature, route])).values()];
  const uniqueRoutes = [...new Map(
    orderedUnique.map((route) => [stablePlaceSetSignatureV2(route.orderedPlaceIds), route]),
  ).values()];
  const previousAutomaticIds = new Set(
    history.latestOrderedPlaceIds.filter((id) => !protectedIds.has(id)),
  );
  const minimumNewAutomaticPlaces = Math.max(0, input.minimumNewAutomaticPlaces ?? 0);
  const quotaRoutes = minimumNewAutomaticPlaces === 0
    ? uniqueRoutes
    : uniqueRoutes.filter((route) => route.orderedPlaceIds.filter(
        (id) => !protectedIds.has(id) && !previousAutomaticIds.has(id),
      ).length >= minimumNewAutomaticPlaces);
  const noveltyQuotaMet = quotaRoutes.length > 0;
  const eligibleRoutes = noveltyQuotaMet ? quotaRoutes : uniqueRoutes;
  const selected: TRoute[] = [];
  const options: RouteStyleOptionV2<TRoute>[] = [];

  for (const style of ROUTE_STYLE_IDS_V2) {
    const remaining = eligibleRoutes.filter((route) =>
      !selected.some(({ signature }) => signature === route.signature)
    );
    if (remaining.length === 0) break;
    const priorCommonAutomaticIds = selected.length < 2
      ? []
      : selected[0]!.orderedPlaceIds.filter((id) =>
          !protectedIds.has(id) && selected.slice(1).every((route) =>
            route.orderedPlaceIds.includes(id)
          )
        );
    const anchorAlternatives = priorCommonAutomaticIds.length === 0
      ? remaining
      : remaining.filter((route) => priorCommonAutomaticIds.every((id) =>
          !route.orderedPlaceIds.includes(id)
        ));
    const anchorCandidates = anchorAlternatives.length > 0
      ? anchorAlternatives
      : remaining;
    const historyFirstAlternatives = anchorCandidates.filter((route) => {
      const first = firstAutomaticPlaceId(route, protectedIds);
      return first !== null && (history.byCandidate[first]?.firstStopAppearances ?? 0) === 0;
    });
    const historyCandidates = historyFirstAlternatives.length > 0
      ? historyFirstAlternatives
      : anchorCandidates;
    const selectedFirstAutomatic = new Set(
      selected.map((route) => firstAutomaticPlaceId(route, protectedIds)).filter(Boolean),
    );
    const firstStopAlternatives = historyCandidates.filter((route) => {
      const first = firstAutomaticPlaceId(route, protectedIds);
      return first !== null && !selectedFirstAutomatic.has(first);
    });
    const styleCandidates = selected.length > 0 && firstStopAlternatives.length > 0
      ? firstStopAlternatives
      : historyCandidates;
    const ranked = styleCandidates.map((route): RankedCandidate<TRoute> => {
      const firstAutomatic = firstAutomaticPlaceId(route, protectedIds);
      const routePlaceSet = stablePlaceSetSignatureV2(route.orderedPlaceIds);
      const candidateHistoryPenalty = route.orderedPlaceIds.reduce((sum, id) => {
        if (protectedIds.has(id)) return sum;
        const signals = history.byCandidate[id];
        if (!signals) return sum;
        return sum +
          signals.recentAppearanceCount * cfg.repeatedAppearancePenalty +
          signals.consecutiveAppearanceCount * cfg.consecutiveAppearancePenalty +
          signals.firstStopAppearances * cfg.firstStopExposurePenalty;
      }, 0);
      const automaticIds = route.orderedPlaceIds.filter((id) => !protectedIds.has(id));
      let coOccurrencePenalty = 0;
      for (let left = 0; left < automaticIds.length; left += 1) {
        for (let right = left + 1; right < automaticIds.length; right += 1) {
          coOccurrencePenalty +=
            (history.byCandidate[automaticIds[left]!]?.coOccurrenceCounts[automaticIds[right]!] ?? 0) *
            cfg.coOccurrencePenalty;
        }
      }
      const historyPenalty =
        (recentSignatures.has(route.signature) ? cfg.recentSignaturePenalty : 0) +
        (recentPlaceSets.has(routePlaceSet) ? cfg.recentPlaceSetPenalty : 0) +
        (firstAutomatic && (history.byCandidate[firstAutomatic]?.firstStopAppearances ?? 0) > 0
          ? cfg.recentFirstAutomaticStopPenalty
          : 0) +
        candidateHistoryPenalty + coOccurrencePenalty;
      const tieBreak = stableHash(`${input.deterministicSeed ?? "route-v2"}:${input.rerollVariant}:${style}:${route.signature}`);
      return {
        route, historyPenalty,
        diversityPenalty: countSharedPlaces(route, selected, protectedIds) * cfg.selectedOptionPlaceOverlapPenalty +
          countSharedDirectedLegs(route, selected) * cfg.selectedOptionOrderOverlapPenalty,
        categoryCoverageBonus: route.categoryCount * cfg.categoryCoverageBonus,
        explorationAdjustment: input.rerollVariant > 0 ? tieBreak % 61 : 0,
        tieBreak,
      };
    }).sort((left, right) => compareRanked(style, left, right));
    const explorationWindow = input.rerollVariant > 0
      ? Math.min(3, ranked.length)
      : 1;
    const winner = ranked[input.rerollVariant % explorationWindow]!.route;
    options.push({ style, route: winner, differenceExplanationCodes: differenceCodes(winner, selected) });
    selected.push(winner);
  }
  const available = noveltyQuotaMet && options.length === ROUTE_STYLE_IDS_V2.length;
  return {
    options,
    alternativeAvailability: available ? "available" : "limited",
    limitedReason: !noveltyQuotaMet
      ? "novelty_quota_unmet"
      : available
        ? null
        : "fewer_than_three_meaningfully_distinct_routes",
  };
}
