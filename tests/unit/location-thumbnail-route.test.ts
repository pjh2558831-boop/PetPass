import { describe, expect, it, vi } from "vitest";
import { createLocationThumbnailHandler } from "@/app/api/places/[placeId]/location-thumbnail/route";

const allowed = { allowed: true, limit: 60, remaining: 59, retryAfterSeconds: 60 };

describe("location thumbnail route", () => {
  it("accepts only a known ID and returns a labelled image response", async () => {
    const findLocation = vi.fn(async () => ({ latitude: 35.15, longitude: 129.12 }));
    const fetchMap = vi.fn(async () => ({ body: new Uint8Array([1, 2, 3]).buffer, contentType: "image/png" as const }));
    const response = await createLocationThumbnailHandler({
      enabled: () => true,
      findLocation,
      fetchMap,
      rateLimit: () => allowed,
    })(new Request("http://localhost/api/places/kakao:123/location-thumbnail?region=busan"), {
      params: Promise.resolve({ placeId: "kakao:123" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("s-maxage=604800");
    expect(findLocation).toHaveBeenCalledWith("busan", "123");
  });

  it("rejects arbitrary URLs and browser-provided coordinates before lookup", async () => {
    const findLocation = vi.fn();
    const handler = createLocationThumbnailHandler({ enabled: () => true, findLocation, rateLimit: () => allowed });
    const response = await handler(new Request("http://localhost/api/places/x/location-thumbnail?region=busan&latitude=35&url=https://evil.test"), {
      params: Promise.resolve({ placeId: "https://evil.test" }),
    });
    expect(response.status).toBe(400);
    expect(findLocation).not.toHaveBeenCalled();
  });

  it("does not call Kakao while the server-only flag is disabled", async () => {
    const fetchMap = vi.fn();
    const response = await createLocationThumbnailHandler({
      enabled: () => false,
      fetchMap,
      rateLimit: () => allowed,
    })(new Request("http://localhost/api/places/kakao:123/location-thumbnail?region=busan"), {
      params: Promise.resolve({ placeId: "kakao:123" }),
    });
    expect(response.status).toBe(404);
    expect(fetchMap).not.toHaveBeenCalled();
  });
});
