import { describe, expect, it, vi } from "vitest";
import { enterRecommendationStage, recordRecommendationProviderFailure, safeProviderFailure, traceRecommendationRequest } from "@/lib/shared/recommendation-trace";

describe("request-scoped recommendation failure trace", () => {
  it("isolates concurrent requests and omits a recovered provider failure", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      let resume!: () => void;
      const waiting = new Promise<void>(resolve => { resume = resolve; });
      const failed = traceRecommendationRequest(async () => {
        enterRecommendationStage("kakao_matrix", 4);
        recordRecommendationProviderFailure("directions", { code: "TIMEOUT", message: "SECRET" });
        await waiting;
        return Response.json({ status: "kakao_provider_unavailable", retryable: true }, { status: 503 });
      });
      const ready = await traceRecommendationRequest(async () => {
        enterRecommendationStage("catalog", 0);
        recordRecommendationProviderFailure("catalog", { httpStatus: 401 });
        enterRecommendationStage("response_mapping", 3);
        return Response.json({ status: "ready" });
      });
      resume();
      const response = await failed;
      expect(response.headers.get("X-Request-ID")).not.toBe(ready.headers.get("X-Request-ID"));
      expect(log).toHaveBeenCalledTimes(1);
      expect(JSON.parse(log.mock.calls[0]![1])).toMatchObject({ correlationId: response.headers.get("X-Request-ID"), firstFailedStage: "kakao_matrix", candidateCount: 4, category: "timeout", upstreamDomainCode: "TIMEOUT" });
      expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET");
    } finally { log.mockRestore(); }
  });

  it("allows only bounded provider codes, never messages or arbitrary error fields", () => {
    expect(safeProviderFailure({ code: "https://secret.invalid/token", httpStatus: NaN, message: "private address", body: { token: "SECRET" } })).toEqual({ category: "provider_failure", httpStatus: null, domainCode: null });
    expect(safeProviderFailure({ code: "INVALID_RESPONSE", resultCode: 104 })).toMatchObject({ category: "invalid_response", domainCode: 104 });
    expect(safeProviderFailure(new Error("catalog unavailable", { cause: { code: "PGRST301", httpStatus: 401 } }))).toMatchObject({ category: "authentication", domainCode: "PGRST301", httpStatus: 401 });
  });
});
