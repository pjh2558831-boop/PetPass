import "server-only";

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  KAKAO_BUSAN_DELTA_QUERIES,
  KAKAO_BUSAN_DELTA_QUERY_REGISTRY_VERSION,
} from "@/lib/kakao/collection";
import {
  createKakaoCollectionPlanReport,
  filterKakaoBusanCollectionQueries,
  parseKakaoCollectionCliArgs,
} from "@/lib/kakao/collection/cli";
import { createKakaoBusanCollectorAdapter } from "@/lib/kakao/collection/collector-adapter";
import { CollectionConfigurationError, collectionErrorCode } from "@/lib/kakao/collection/errors";
import { createKakaoCollectionProvider } from "@/lib/kakao/collection/provider";
import {
  KAKAO_COLLECTION_LIMITS,
  executeKakaoCollection,
  plannedMaximumProviderCalls,
  type KakaoCollectionLimits,
} from "@/lib/kakao/collection/runner";
import { createSupabaseKakaoCollectionRepository } from "@/lib/kakao/collection/supabase-repository";

export const KAKAO_DELTA_COLLECTION_LIMITS: KakaoCollectionLimits = {
  ...KAKAO_COLLECTION_LIMITS,
  concurrency: 2,
  requestCap: 104,
};

function loadLocalEnvironmentIfNeeded(requiredNames: readonly string[]): void {
  if (requiredNames.every((name) => process.env[name]?.trim())) return;
  const path = resolve(process.cwd(), ".env.local");
  if (existsSync(path)) process.loadEnvFile(path);
}

function requireServerEnvironment(names: readonly string[]): void {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new CollectionConfigurationError(`Missing required server environment variables: ${missing.join(", ")}`);
  }
}

export async function runKakaoBusanDeltaCollectorCli(args: readonly string[]): Promise<void> {
  const options = parseKakaoCollectionCliArgs(args);
  const plannedQueries = filterKakaoBusanCollectionQueries(KAKAO_BUSAN_DELTA_QUERIES, options);
  const plan = createKakaoCollectionPlanReport({
    mode: options.mode,
    registryVersion: KAKAO_BUSAN_DELTA_QUERY_REGISTRY_VERSION,
    queries: plannedQueries,
    limits: KAKAO_DELTA_COLLECTION_LIMITS,
  });
  if (options.mode === "plan") {
    console.log(JSON.stringify({ ok: true, plan, delta: true, staleReconciliation: false }));
    return;
  }

  const required = options.mode === "dry-run"
    ? ["KAKAO_REST_API_KEY"]
    : ["KAKAO_REST_API_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"];
  loadLocalEnvironmentIfNeeded(required);
  requireServerEnvironment(required);
  const adapter = createKakaoBusanCollectorAdapter(plannedQueries);
  const repository = options.mode === "dry-run" ? undefined : createSupabaseKakaoCollectionRepository();
  const summary = await executeKakaoCollection({
    mode: options.mode,
    registryVersion: KAKAO_BUSAN_DELTA_QUERY_REGISTRY_VERSION,
    queries: adapter.queries,
    provider: createKakaoCollectionProvider(),
    classification: adapter.classification,
    ...(repository ? { repository } : {}),
    ...(options.resumeRunId ? { resumeRunId: options.resumeRunId } : {}),
    isFullCatalogRun: false,
    limits: KAKAO_DELTA_COLLECTION_LIMITS,
  });
  console.log(JSON.stringify({
    ok: summary.status === "completed",
    plan,
    execution: {
      queryCount: plannedQueries.length,
      theoreticalMaxProviderCalls: plannedMaximumProviderCalls(plannedQueries.length, KAKAO_DELTA_COLLECTION_LIMITS),
      representativeSample: null,
      staleReconciliation: false,
    },
    summary,
  }));
  if (summary.status !== "completed") process.exitCode = 2;
}

async function main(): Promise<void> {
  try {
    await runKakaoBusanDeltaCollectorCli(process.argv.slice(2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      code: collectionErrorCode(error),
      ...(error instanceof CollectionConfigurationError ? { reason: error.message } : {}),
    }));
    process.exitCode = 1;
  }
}

const directEntry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (directEntry === import.meta.url) void main();
