import "server-only";

export const HOMEPAGE_TIMING_NAMES = [
  "app_cache",
  "supabase_catalog",
  "kto_list",
  "kto_details",
  "merge",
  "serialize",
  "total",
] as const;

export type HomepageTimingName = (typeof HOMEPAGE_TIMING_NAMES)[number];
export type HomepageCacheTimingDescription =
  | "hit"
  | "miss"
  | "coalesced"
  | "stale";

export interface HomepageTimingObservation {
  name: HomepageTimingName;
  durationMs: number;
  description?: HomepageCacheTimingDescription;
}

export type HomepageTimingObserver = (
  observation: HomepageTimingObservation,
) => void;

const MAX_REPORTED_DURATION_MS = 120_000;

function boundedDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs)) return 0;
  return Math.min(MAX_REPORTED_DURATION_MS, Math.max(0, durationMs));
}

function formatDuration(durationMs: number): string {
  return boundedDuration(durationMs).toFixed(1);
}

export function createHomepageTimingRecorder({
  now = () => performance.now(),
}: {
  now?: () => number;
} = {}) {
  const startedAt = now();
  const observations: HomepageTimingObservation[] = [];

  const observe: HomepageTimingObserver = (observation) => {
    observations.push({
      ...observation,
      durationMs: boundedDuration(observation.durationMs),
    });
  };

  return {
    now,
    observe,
    finish(): string {
      observe({ name: "total", durationMs: now() - startedAt });
      return observations
        .map(({ name, durationMs, description }) =>
          `${name};dur=${formatDuration(durationMs)}${description ? `;desc=${description}` : ""}`,
        )
        .join(", ");
    },
  };
}
