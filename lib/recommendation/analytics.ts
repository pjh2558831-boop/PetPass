export const RECOMMENDATION_ANALYTICS_EVENTS = [
  "recommendation_requested",
  "recommendation_ready",
  "recommendation_failed",
  "alternative_selected",
  "manual_route_revalidated",
  "route_saved_locally",
] as const;

export type RecommendationAnalyticsEvent =
  (typeof RECOMMENDATION_ANALYTICS_EVENTS)[number];

const EVENT_SET = new Set<string>(RECOMMENDATION_ANALYTICS_EVENTS);

export function isRecommendationAnalyticsEvent(
  value: unknown,
): value is RecommendationAnalyticsEvent {
  return typeof value === "string" && EVENT_SET.has(value);
}

/**
 * Stage 5 has no authenticated, abuse-resistant analytics ingestion boundary.
 * The product deliberately keeps this non-blocking sink disabled until that
 * boundary and private aggregate storage are available.
 */
export async function recordRecommendationAnalytics(
  event: RecommendationAnalyticsEvent,
): Promise<{ accepted: false; reason: "analytics_ingestion_disabled" }> {
  if (!isRecommendationAnalyticsEvent(event)) {
    throw new TypeError("Unsupported recommendation analytics event.");
  }
  return { accepted: false, reason: "analytics_ingestion_disabled" };
}
