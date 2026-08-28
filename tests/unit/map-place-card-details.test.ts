import { describe, expect, it, vi } from "vitest";
import { createMapPlaceCardDetailsHandler } from "@/app/api/map/places/cards/handler";
import {
  assembleMapPlaceCardDetails,
  createMapPlaceCardDetailsLoader,
} from "@/lib/map-places/card-details";
import type { MapPlaceCardDetailsPage } from "@/types/map-place-card-details";

const rows = Array.from({ length: 12 }, (_, index) => ({
  provider: "tour" as const,
  provider_place_id: String(38_000 + index),
  catalog_dataset: "shopping" as const,
  road_address: `경기도 수원시 ${index}`,
  lot_address: null,
  phone: null,
  image_url: index === 0 ? "https://example.com/place.jpg" : null,
  source_url: null,
  content_type_id: 38,
  is_active: true,
  public_visibility: false,
  pending_publication_run_id: null,
  lifecycle_status: null,
  review_status: "needs_review",
}));

describe("map card detail delivery", () => {
  it("loads one bounded batch for a paginated card page instead of one request per marker", async () => {
    const queryRows = vi.fn(async () => rows);
    const result = await assembleMapPlaceCardDetails({
      region: "gyeonggi",
      dataset: "shopping",
      ids: rows.map((row) => `tour:${row.provider_place_id}`),
      publicationVersion: "p1-1111111111111111",
    }, { queryRows });

    expect(queryRows).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(12);
    expect(result.items[0]).toMatchObject({
      id: "tour:38000",
      address: "경기도 수원시 0",
      imageUrl: "https://example.com/place.jpg",
      placeUrl: null,
    });
  });

  it("deduplicates an identical in-flight page and isolates publication versions", async () => {
    let publicationVersion: `p1-${string}` = "p1-1111111111111111";
    let release!: (value: typeof rows) => void;
    const queryRows = vi.fn(async () => new Promise<typeof rows>((resolve) => { release = resolve; }));
    const load = createMapPlaceCardDetailsLoader({
      queryRows,
      resolvePublicationVersion: vi.fn(async () => publicationVersion),
    });
    const input = { region: "gyeonggi" as const, dataset: "shopping" as const, ids: ["tour:38000"] };
    const first = load(input);
    const second = load(input);
    await vi.waitFor(() => expect(queryRows).toHaveBeenCalledTimes(1));
    release(rows.slice(0, 1));
    await Promise.all([first, second]);
    expect(queryRows).toHaveBeenCalledTimes(1);

    publicationVersion = "p1-2222222222222222";
    const changed = load(input);
    await vi.waitFor(() => expect(queryRows).toHaveBeenCalledTimes(2));
    release(rows.slice(0, 1));
    await changed;
    expect(queryRows).toHaveBeenCalledTimes(2);
  });

  it("isolates concurrent core publication lookups by provider set", async () => {
    const queryRows = vi.fn(async (input: { ids: string[] }) => {
      const isTour = input.ids[0]?.startsWith("tour:");
      return [{
        ...rows[0],
        provider: isTour ? "tour" as const : "kakao" as const,
        provider_place_id: isTour ? "100" : "200",
        catalog_dataset: "core" as const,
        source_url: isTour ? null : "https://place.map.kakao.com/200",
        content_type_id: isTour ? 12 : null,
        public_visibility: true,
        lifecycle_status: isTour ? null : "current",
        review_status: isTour ? "needs_review" : "confirmed",
      }];
    });
    const resolvePublicationVersion = vi.fn(async (input: { ids: string[] }) =>
      input.ids[0]?.startsWith("tour:")
        ? "p1-1111111111111111" as const
        : "p1-2222222222222222" as const);
    const load = createMapPlaceCardDetailsLoader({ queryRows, resolvePublicationVersion });

    const [tourPage, kakaoPage] = await Promise.all([
      load({ region: "busan", dataset: "core", ids: ["tour:100"] }),
      load({ region: "busan", dataset: "core", ids: ["kakao:200"] }),
    ]);

    expect(resolvePublicationVersion).toHaveBeenCalledTimes(2);
    expect(tourPage.publicationVersion).toBe("p1-1111111111111111");
    expect(kakaoPage.publicationVersion).toBe("p1-2222222222222222");
  });

  it("returns public cache metadata and rejects more than one card page", async () => {
    const loadDetails = vi.fn(async () => assembleMapPlaceCardDetails({
      region: "gyeonggi",
      dataset: "shopping",
      ids: ["tour:38000"],
      publicationVersion: "p1-1111111111111111",
    }, { queryRows: vi.fn(async () => rows.slice(0, 1)) }));
    const handler = createMapPlaceCardDetailsHandler({ loadDetails });
    const response = await handler(new Request(
      "http://localhost/api/map/places/cards?version=1&region=gyeonggi&dataset=shopping&ids=tour%3A38000",
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("public");
    expect(response.headers.get("etag")).toContain("p1-1111111111111111");
    expect(loadDetails).toHaveBeenCalledTimes(1);

    const tooMany = Array.from({ length: 13 }, (_, index) => `tour:${index}`).join(",");
    const rejected = await handler(new Request(
      `http://localhost/api/map/places/cards?version=1&region=gyeonggi&dataset=shopping&ids=${encodeURIComponent(tooMany)}`,
    ));
    expect(rejected.status).toBe(400);
  });

  it("rejects an incomplete card page instead of silently degrading card data", async () => {
    const incompletePage: MapPlaceCardDetailsPage = {
      contractVersion: 1,
      region: "gyeonggi",
      dataset: "shopping",
      publicationVersion: "p1-1111111111111111",
      items: [],
      page: 1,
      pageSize: 12,
      totalCount: 0,
    };
    const handler = createMapPlaceCardDetailsHandler({
      loadDetails: vi.fn(async () => incompletePage),
    });
    const response = await handler(new Request(
      "http://localhost/api/map/places/cards?version=1&region=gyeonggi&dataset=shopping&ids=tour%3A38000",
    ));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
