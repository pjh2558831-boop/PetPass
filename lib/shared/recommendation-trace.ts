import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type RecommendationStage = "catalog" | "candidate_selection" | "kakao_matrix" | "route_search" | "final_directions" | "response_mapping";
const context = new AsyncLocalStorage<{
  id: string;
  stage: RecommendationStage | null;
  candidates: number;
  errors: Partial<Record<RecommendationStage, ReturnType<typeof safeProviderFailure> & { operation: string }>>;
}>();

/** Never serialize error messages, bodies, stacks, or arbitrary provider fields. */
export function safeProviderFailure(error: unknown) {
  const outer = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const source = outer.cause && typeof outer.cause === "object" ? outer.cause as Record<string, unknown> : outer;
  const httpStatus = typeof source.httpStatus === "number" && source.httpStatus >= 100 && source.httpStatus <= 599 ? source.httpStatus : null;
  const code = typeof source.code === "string" && /^(?:PGRST\d{3}|[0-9A-Z]{5}|BUDGET_EXCEEDED|UNSUPPORTED_FUTURE|INVALID_ENDPOINT|TIMEOUT|NETWORK|HTTP_ERROR|INVALID_RESPONSE)$/u.test(source.code) ? source.code : null;
  const category = httpStatus === 429 ? "rate_limited" : httpStatus === 401 || httpStatus === 403 ? "authentication" : code === "TIMEOUT" ? "timeout" : code === "NETWORK" ? "network" : code === "INVALID_RESPONSE" ? "invalid_response" : httpStatus ? "upstream_http" : "provider_failure";
  return { category, httpStatus, domainCode: typeof source.resultCode === "number" && Number.isFinite(source.resultCode) ? source.resultCode : code };
}

export function enterRecommendationStage(stage: RecommendationStage, candidates?: number) {
  const trace = context.getStore();
  if (!trace) return;
  trace.stage = stage;
  if (candidates !== undefined) trace.candidates = candidates;
}

export function recordRecommendationProviderFailure(operation: string, error: unknown) {
  const trace = context.getStore();
  if (trace?.stage && !trace.errors[trace.stage]) trace.errors[trace.stage] = { ...safeProviderFailure(error), operation };
}

export async function traceRecommendationRequest(run: () => Promise<Response>): Promise<Response> {
  const trace = { id: randomUUID(), stage: null as RecommendationStage | null, candidates: 0, errors: {} };
  const started = performance.now();
  return context.run(trace, async () => {
    const response = await run();
    response.headers.set("X-Request-ID", trace.id);
    if (response.ok) return response;
    const body = await response.clone().json();
    const failure = trace.stage ? context.getStore()!.errors[trace.stage] : undefined;
    const provider = trace.stage === "catalog" ? "supabase" : trace.stage === "kakao_matrix" || trace.stage === "final_directions" ? "kakao" : "application";
    console.warn("[recommendation_failure]", JSON.stringify({
      correlationId: trace.id, firstFailedStage: trace.stage, provider,
      operation: failure?.operation ?? trace.stage ?? "request_validation",
      category: failure?.category ?? body.status,
      upstreamHttpStatus: failure?.httpStatus ?? null, upstreamDomainCode: failure?.domainCode ?? null,
      elapsedMs: Math.round(performance.now() - started), candidateCount: trace.candidates,
      retryable: body.retryable === true,
    }));
    if (body.status !== "internal_error") return response;
    return Response.json({ ...body, userMessage: `${body.userMessage} (참조 번호: ${trace.id.slice(0, 8)})` }, { status: response.status, headers: response.headers });
  });
}
