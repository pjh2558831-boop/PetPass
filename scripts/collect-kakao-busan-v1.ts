import "server-only";

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  KAKAO_BUSAN_COLLECTION_QUERIES,
  KAKAO_BUSAN_QUERY_COUNT,
  KAKAO_BUSAN_QUERY_REGISTRY_VERSION,
} from "@/lib/kakao/collection";
import {
  createKakaoCollectionPlanReport,
  filterKakaoBusanCollectionQueries,
  parseKakaoCollectionCliArgs,
  selectKakaoCollectionDryRunQueries,
} from "@/lib/kakao/collection/cli";
import { createKakaoBusanCollectorAdapter } from "@/lib/kakao/collection/collector-adapter";
import {
  CollectionConfigurationError,
  collectionErrorCode,
} from "@/lib/kakao/collection/errors";
import { createKakaoCollectionProvider } from "@/lib/kakao/collection/provider";
import {
  executeKakaoCollection,
  plannedMaximumProviderCalls,
} from "@/lib/kakao/collection/runner";
import { createSupabaseKakaoCollectionRepository } from "@/lib/kakao/collection/supabase-repository";

function loadLocalEnvironmentIfNeeded(requiredNames: readonly string[]): void {
  if (requiredNames.every((name) => process.env[name]?.trim())) return;
  const environmentPath = resolve(process.cwd(), ".env.local");
  if (existsSync(environmentPath)) process.loadEnvFile(environmentPath);
}

function requireServerEnvironment(names: readonly string[]): void {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new CollectionConfigurationError(
      `Missing required server environment variables: ${missing.join(", ")}`,
    );
  }
}

function safeFailure(error: unknown): Record<string, string | false> {
  return {
    ok: false,
    code: collectionErrorCode(error),
    ...(error instanceof CollectionConfigurationError
      ? { reason: error.message }
      : {}),
  };
}

export async function runKakaoBusanCollectorCli(
  args: readonly string[],
): Promise<void> {
  const options = parseKakaoCollectionCliArgs(args);
  const plannedQueries = filterKakaoBusanCollectionQueries(
    KAKAO_BUSAN_COLLECTION_QUERIES,
    options,
  );
  const plan = createKakaoCollectionPlanReport({
    mode: options.mode,
    registryVersion: KAKAO_BUSAN_QUERY_REGISTRY_VERSION,
    queries: plannedQueries,
  });

  if (options.mode === "plan") {
    console.log(JSON.stringify({ ok: true, plan }));
    return;
  }

  const requiredEnvironmentNames =
    options.mode === "dry-run"
      ? ["KAKAO_REST_API_KEY"]
      : [
          "KAKAO_REST_API_KEY",
          "NEXT_PUBLIC_SUPABASE_URL",
          "SUPABASE_SECRET_KEY",
        ];
  loadLocalEnvironmentIfNeeded(requiredEnvironmentNames);
  requireServerEnvironment(requiredEnvironmentNames);

  const executionSourceQueries =
    options.mode === "dry-run"
      ? selectKakaoCollectionDryRunQueries(plannedQueries)
      : plannedQueries;
  const adapter = createKakaoBusanCollectorAdapter(executionSourceQueries);
  const repository =
    options.mode === "dry-run"
      ? undefined
      : createSupabaseKakaoCollectionRepository();
  const summary = await executeKakaoCollection({
    mode: options.mode,
    registryVersion: KAKAO_BUSAN_QUERY_REGISTRY_VERSION,
    queries: adapter.queries,
    provider: createKakaoCollectionProvider(),
    classification: adapter.classification,
    ...(repository ? { repository } : {}),
    ...(options.resumeRunId ? { resumeRunId: options.resumeRunId } : {}),
    isFullCatalogRun:
      options.mode === "apply" &&
      plannedQueries.length === KAKAO_BUSAN_QUERY_COUNT &&
      !options.district &&
      !options.kind,
  });

  console.log(
    JSON.stringify({
      ok: summary.status === "completed",
      plan,
      execution: {
        queryCount: executionSourceQueries.length,
        theoreticalMaxProviderCalls: plannedMaximumProviderCalls(
          executionSourceQueries.length,
        ),
        representativeSample:
          options.mode === "dry-run" ? "first-per-district-and-family" : null,
      },
      summary,
    }),
  );
  if (summary.status !== "completed") process.exitCode = 2;
}

async function main(): Promise<void> {
  try {
    await runKakaoBusanCollectorCli(process.argv.slice(2));
  } catch (error) {
    console.error(JSON.stringify(safeFailure(error)));
    process.exitCode = 1;
  }
}

const directEntry = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (directEntry === import.meta.url) void main();
