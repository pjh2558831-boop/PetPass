import "server-only";

import {
  attachTourPetAccessEvaluationTime,
  createTrustedTourPetAccessInput,
  evaluateTourPetAccess,
} from "@/lib/pet-access/tourism/evaluator";
import {
  BUSAN_REGION,
  TOUR_DEFAULT_CATALOG_CONTENT_TYPE_IDS,
  type TourCatalogCategory,
} from "@/lib/tour-api/catalog";
import {
  collectTourCatalog,
  type TourCatalogCollectionQuery,
} from "@/lib/tour-api/catalog-service";
import type { TourPlaceService } from "@/lib/tour-api/service";
import type {
  HomepageFeaturedPlace,
  HomepageFeaturedState,
  TourHomepageSnapshot,
} from "@/types/homepage";
import type {
  TourPlaceDetail,
  TourPlaceList,
  TourPlaceSummary,
} from "@/types/place";
import type { TourPetAccessAssessment } from "@/types/tour-pet-access";

export const HOMEPAGE_PREFERRED_CONTENT_IDS = [
  "3426656",
  "2699563",
  "3443614",
] as const;

export const HOMEPAGE_FEATURED_CANDIDATE_LIMIT = 10;
export const HOMEPAGE_FEATURED_CONCURRENCY = 3;
export const HOMEPAGE_FEATURED_PLACE_LIMIT = 5;

const HOMEPAGE_CATEGORY_ORDER = [
  "attraction",
  "culture",
  "festival",
  "leisure",
  "accommodation",
  "food",
] as const satisfies readonly TourCatalogCategory[];

const DEFAULT_CONTENT_TYPE_IDS = new Set<string>(
  TOUR_DEFAULT_CATALOG_CONTENT_TYPE_IDS,
);

type CatalogCollector = (
  service: TourPlaceService,
  query: TourCatalogCollectionQuery,
) => Promise<TourPlaceList>;

export interface TourHomepageCatalogDependencies {
  service: TourPlaceService;
  now?: () => Date;
  collectCatalog?: CatalogCollector;
}

interface AssessmentSuccess {
  status: "fulfilled";
  candidate: TourPlaceSummary;
  detail: TourPlaceDetail;
  assessment: TourPetAccessAssessment;
}

interface AssessmentFailure {
  status: "rejected";
  candidate: TourPlaceSummary;
}

type AssessmentOutcome = AssessmentSuccess | AssessmentFailure;

function isCurrentHomepageCandidate(place: TourPlaceSummary): boolean {
  return Boolean(
    place.contentTypeId &&
      DEFAULT_CONTENT_TYPE_IDS.has(place.contentTypeId) &&
      place.legalRegionCode === BUSAN_REGION.code &&
      place.providerVisibility?.status === "exposed",
  );
}

/**
 * Preferred IDs affect ordering only. They must still occur in the freshly
 * visibility-joined catalog before they can be assessed.
 */
export function selectHomepageCandidates(
  catalog: TourPlaceList,
): TourPlaceSummary[] {
  const current = new Map<string, TourPlaceSummary>();
  for (const place of catalog.places) {
    if (isCurrentHomepageCandidate(place) && !current.has(place.contentId)) {
      current.set(place.contentId, place);
    }
  }

  const selected: TourPlaceSummary[] = [];
  const selectedIds = new Set<string>();
  const categoryCounts = new Map<TourCatalogCategory, number>(
    HOMEPAGE_CATEGORY_ORDER.map((category) => [category, 0]),
  );

  const add = (place: TourPlaceSummary | undefined): void => {
    if (!place || selectedIds.has(place.contentId)) return;
    selected.push(place);
    selectedIds.add(place.contentId);
    if (categoryCounts.has(place.category as TourCatalogCategory)) {
      const category = place.category as TourCatalogCategory;
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
  };

  for (const contentId of HOMEPAGE_PREFERRED_CONTENT_IDS) {
    add(current.get(contentId));
  }

  const buckets = new Map<TourCatalogCategory, TourPlaceSummary[]>(
    HOMEPAGE_CATEGORY_ORDER.map((category) => [
      category,
      [...current.values()].filter(
        (place) =>
          place.category === category && !selectedIds.has(place.contentId),
      ),
    ]),
  );

  while (selected.length < HOMEPAGE_FEATURED_CANDIDATE_LIMIT) {
    const category = HOMEPAGE_CATEGORY_ORDER
      .filter((value) => (buckets.get(value)?.length ?? 0) > 0)
      .sort(
        (left, right) =>
          (categoryCounts.get(left) ?? 0) -
          (categoryCounts.get(right) ?? 0),
      )[0];
    if (!category) break;
    const backup = buckets.get(category)?.shift();
    add(backup);
  }

  return selected.slice(0, HOMEPAGE_FEATURED_CANDIDATE_LIMIT);
}

async function assessCandidates(
  service: TourPlaceService,
  candidates: TourPlaceSummary[],
  evaluatedAt: string,
): Promise<AssessmentOutcome[]> {
  const outcomes = new Array<AssessmentOutcome>(candidates.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < candidates.length) {
      const index = nextIndex;
      nextIndex += 1;
      const candidate = candidates[index];
      try {
        // The list record is only a candidate. detailCommon2 and the current
        // visibility check performed by the service remain authoritative.
        const detail = await service.getPlaceDetail(candidate.contentId);
        if (!detailMatchesCandidate(candidate, detail)) {
          outcomes[index] = { status: "rejected", candidate };
          continue;
        }
        const assessment = attachTourPetAccessEvaluationTime(
          evaluateTourPetAccess(createTrustedTourPetAccessInput(detail)),
          evaluatedAt,
        );
        outcomes[index] = {
          status: "fulfilled",
          candidate,
          detail,
          assessment,
        };
      } catch {
        outcomes[index] = { status: "rejected", candidate };
      }
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(HOMEPAGE_FEATURED_CONCURRENCY, candidates.length),
      },
      () => worker(),
    ),
  );
  return outcomes;
}

function detailMatchesCandidate(
  candidate: TourPlaceSummary,
  detail: TourPlaceDetail,
): boolean {
  return Boolean(
    detail.summary.contentId === candidate.contentId &&
      detail.summary.contentTypeId &&
      DEFAULT_CONTENT_TYPE_IDS.has(detail.summary.contentTypeId) &&
      detail.summary.legalRegionCode === BUSAN_REGION.code &&
      detail.summary.providerVisibility?.status === "exposed",
  );
}

function featuredState(
  outcomes: AssessmentOutcome[],
  featuredPlaces: HomepageFeaturedPlace[],
): HomepageFeaturedState {
  if (outcomes.length === 0) return "empty";

  const everyAttemptUnavailable = outcomes.every(
    (outcome) =>
      outcome.status === "rejected" ||
      outcome.assessment.evaluationState === "unavailable",
  );
  if (everyAttemptUnavailable) return "unavailable";

  const hasDegradedAttempt = outcomes.some(
    (outcome) =>
      outcome.status === "rejected" ||
      outcome.assessment.evaluationState !== "complete",
  );
  if (hasDegradedAttempt) return "partial";

  return featuredPlaces.length > 0 ? "ready" : "empty";
}

export async function collectTourHomepageSnapshot({
  service,
  now = () => new Date(),
  collectCatalog = collectTourCatalog,
}: TourHomepageCatalogDependencies): Promise<TourHomepageSnapshot> {
  const catalog = await collectCatalog(service, {
    regionCode: BUSAN_REGION.code,
  });
  const candidates = selectHomepageCandidates(catalog);
  const evaluatedAt = now().toISOString();
  const outcomes = await assessCandidates(service, candidates, evaluatedAt);
  const successful = outcomes.filter(
    (outcome): outcome is AssessmentSuccess => outcome.status === "fulfilled",
  );
  const places = successful
    .filter(
      ({ assessment }) =>
        assessment.verdict === "allowed" &&
        assessment.evaluationState === "complete",
    )
    .slice(0, HOMEPAGE_FEATURED_PLACE_LIMIT)
    .map(({ detail, assessment }) => ({
      summary: detail.summary,
      assessment,
      source: detail.source,
    }));

  return {
    catalog,
    featured: {
      state: featuredState(outcomes, places),
      places,
      assessedCount: successful.length,
      failedCount: outcomes.length - successful.length,
    },
  };
}
