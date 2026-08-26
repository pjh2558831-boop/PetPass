export const HOMEPAGE_BROWSER_TIMING_STAGES = [
  "initial",
  "completion",
  "optional",
  "enrichment",
  "filter",
  "map",
] as const;

export const HOMEPAGE_BROWSER_TIMING_METRICS = [
  "request_delay",
  "feedback",
  "headers",
  "download",
  "parse",
  "validation",
  "normalization",
  "deduplication",
  "index",
  "computation",
  "sorting",
  "pagination",
  "react_commit",
  "marker_update",
  "cluster_update",
  "total",
] as const;

export type HomepageBrowserTimingStage =
  (typeof HOMEPAGE_BROWSER_TIMING_STAGES)[number];
export type HomepageBrowserTimingMetric =
  (typeof HOMEPAGE_BROWSER_TIMING_METRICS)[number];

export function homepageBrowserTimingName(
  stage: HomepageBrowserTimingStage,
  metric: HomepageBrowserTimingMetric,
): string {
  return `weekendog:homepage:${stage}:${metric}`;
}

export function recordHomepageBrowserTiming(
  stage: HomepageBrowserTimingStage,
  metric: HomepageBrowserTimingMetric,
  startedAt: number,
): void {
  if (typeof performance === "undefined" || typeof performance.measure !== "function") return;
  performance.measure(homepageBrowserTimingName(stage, metric), {
    start: startedAt,
    end: performance.now(),
  });
}
