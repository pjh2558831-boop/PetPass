import { describe, expect, it } from "vitest";
import { readExplorerView, saveExplorerView } from "@/lib/map-places/explorer-view-memory";

const view = { searchQuery: "해변", selectedId: "tour:1", activeBounds: null, camera: { center: { latitude: 35.1, longitude: 129.1 }, level: 6 }, listScroll: 210, mobileMode: "list" as const, rankingAsOf: "2026-09-10T00:00:00Z" };
describe("explorer tab view memory", () => {
  it("restores only the exact URL scope and expires without storing place records", () => {
    saveExplorerView("busan:2", view, 1000);
    expect(readExplorerView("seoul:2", 1001)).toBeNull();
    expect(readExplorerView("busan:2", 1001)).toEqual(view);
    expect(readExplorerView("busan:2", 301001)).toBeNull();
  });
  it("evicts old views after twenty exact scopes", () => {
    for (let i = 0; i < 21; i++) saveExplorerView(`scope:${i}`, view, 1000);
    expect(readExplorerView("scope:0", 1001)).toBeNull();
    expect(readExplorerView("scope:20", 1001)).toEqual(view);
  });
});
