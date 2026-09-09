import "server-only";
import { TourProviderError } from "@/lib/tour-api/errors";

export async function contentRequest(url: URL, options: RequestInit, fetcher: typeof fetch): Promise<Response> {
  try {
    const response = await fetcher(url, { ...options, cache: "no-store", redirect: "error" });
    if (!response.ok) {
      const code = response.status === 401 ? "AUTHENTICATION" : response.status === 403 ? "FORBIDDEN" : response.status === 429 ? "QUOTA_EXHAUSTED" : "UPSTREAM";
      const retryAfter = response.headers.get("Retry-After");
      const retryAt = retryAfter && /^\d+$/.test(retryAfter) ? Date.now() + Number(retryAfter) * 1000 : Date.parse(retryAfter ?? "");
      throw Object.assign(new TourProviderError(code, "콘텐츠 공급자 요청 실패"), { retryAt });
    }
    return response;
  } catch (error) {
    if (error instanceof TourProviderError) throw error;
    throw new TourProviderError(options.signal?.aborted ? "TIMEOUT" : "UPSTREAM", "콘텐츠 공급자 연결 실패");
  }
}
