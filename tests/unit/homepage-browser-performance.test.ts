import { describe, expect, it, vi } from "vitest";
import {
  homepageBrowserTimingName,
  recordHomepageBrowserTiming,
} from "@/lib/homepage/browser-performance";

describe("homepage browser performance instrumentation", () => {
  it("uses stable stage and metric names", () => {
    expect(homepageBrowserTimingName("completion", "validation"))
      .toBe("weekendog:homepage:completion:validation");
    expect(homepageBrowserTimingName("filter", "computation"))
      .toBe("weekendog:homepage:filter:computation");
  });

  it("records a bounded browser measure without changing application state", () => {
    const measure = vi.spyOn(performance, "measure").mockImplementation(() => ({} as PerformanceMeasure));
    const now = vi.spyOn(performance, "now").mockReturnValue(25);

    recordHomepageBrowserTiming("map", "cluster_update", 10);

    expect(measure).toHaveBeenCalledWith(
      "weekendog:homepage:map:cluster_update",
      { start: 10, end: 25 },
    );
    measure.mockRestore();
    now.mockRestore();
  });
});
