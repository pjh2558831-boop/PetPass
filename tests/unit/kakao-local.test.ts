import { describe, expect, it, vi } from "vitest";
import { searchKakaoPlacePage } from "@/lib/kakao/local";
import {
  ProviderHttpError,
  ProviderResponseError,
  ProviderTimeoutError,
} from "@/lib/shared/errors";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("Kakao Local page contract", () => {
  it("preserves the allowlisted category-group and same-name metadata", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        meta: {
          total_count: 1,
          pageable_count: 1,
          is_end: true,
          same_name: {
            region: ["부산광역시", "수영구"],
            keyword: "애견동반 카페",
            selected_region: "부산광역시 수영구",
          },
        },
        documents: [
          {
            id: "123",
            place_name: "광안 반려 카페",
            category_name: "음식점 > 카페",
            category_group_code: "CE7",
            category_group_name: "카페",
            phone: "051-000-0000",
            address_name: "부산 수영구 광안동 1",
            road_address_name: "부산 수영구 광안해변로 1",
            place_url: "https://place.map.kakao.com/123",
            distance: "",
            x: "129.1131",
            y: "35.1456",
          },
        ],
      }),
    );

    const page = await searchKakaoPlacePage(
      { query: "부산 수영구 애견동반 카페", page: 1, size: 15 },
      { apiKey: "test-key", fetchImpl },
    );

    expect(page.results[0]).toMatchObject({
      categoryGroupCode: "CE7",
      categoryGroupName: "카페",
    });
    expect(page.sameName).toEqual({
      region: ["부산광역시", "수영구"],
      keyword: "애견동반 카페",
      selectedRegion: "부산광역시 수영구",
    });
  });

  it("exposes only retry-safe status metadata for provider failures", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("provider body must not be surfaced", {
        status: 429,
        headers: { "retry-after": "2" },
      }),
    );

    const request = searchKakaoPlacePage(
      { query: "부산 수영구 애견동반", page: 1, size: 15 },
      { apiKey: "test-key", fetchImpl },
    );

    await expect(request).rejects.toMatchObject({
      name: "ProviderHttpError",
      status: 429,
      retryAfterMs: 2_000,
    } satisfies Partial<ProviderHttpError>);
    await expect(request).rejects.not.toThrow(/provider body/u);
  });

  it("uses a retryable timeout error without exposing request details", async () => {
    const request = searchKakaoPlacePage(
      { query: "부산 수영구 애견동반", page: 1, size: 15 },
      {
        apiKey: "test-key",
        fetchImpl: vi.fn(async () => {
          throw Object.assign(new Error("network detail"), {
            name: "TimeoutError",
          });
        }),
      },
    );

    await expect(request).rejects.toBeInstanceOf(ProviderTimeoutError);
    await expect(request).rejects.not.toThrow(/network detail/u);
  });

  it("does not misreport a non-timeout network failure as a timeout", async () => {
    const request = searchKakaoPlacePage(
      { query: "부산 수영구 애견동반", page: 1, size: 15 },
      {
        apiKey: "test-key",
        fetchImpl: vi.fn(async () => {
          throw new Error("private network detail");
        }),
      },
    );

    await expect(request).rejects.toBeInstanceOf(ProviderResponseError);
    await expect(request).rejects.not.toBeInstanceOf(ProviderTimeoutError);
    await expect(request).rejects.not.toThrow(/private network detail/u);
  });
});
