import { describe, expect, it, vi } from "vitest";
import { loadSnapshotWithFallback } from "@/lib/map-places/snapshot-client";

describe("map snapshot browser fallback", () => {
  it("uses the paged fallback only after snapshot validation fails", async () => {
    const events: string[] = [];
    const fallback = vi.fn(async () => {
      events.push("fallback");
      return ["legacy"];
    });
    const result = await loadSnapshotWithFallback({
      requestSnapshot: async () => {
        events.push("snapshot");
        throw new Error("invalid snapshot");
      },
      requestFallback: fallback,
    });

    expect(result).toEqual({ source: "fallback", items: ["legacy"] });
    expect(events).toEqual(["snapshot", "fallback"]);
  });

  it("does not activate fallback for an aborted snapshot", async () => {
    const fallback = vi.fn();
    await expect(loadSnapshotWithFallback({
      requestSnapshot: async () => { throw new DOMException("Aborted", "AbortError"); },
      requestFallback: fallback,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(fallback).not.toHaveBeenCalled();
  });
});
