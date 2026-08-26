import "server-only";

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  getKtoCollectionEnabledRegionConfig,
  type KtoCollectionEnabledRegionConfig,
} from "@/lib/regions/config";
import { parseKtoCatalogCliArgs } from "@/lib/tour-api/collection/cli";
import type {
  KtoCatalogCollectionRepository,
  KtoCatalogProvider,
} from "@/lib/tour-api/collection/contracts";
import {
  KtoCatalogCollectionError,
  collectionErrorCode,
} from "@/lib/tour-api/collection/errors";
import { createKtoCatalogProvider } from "@/lib/tour-api/collection/provider";
import { executeKtoCollection } from "@/lib/tour-api/collection/runner";
import { createSupabaseKtoCatalogRepository } from "@/lib/tour-api/collection/supabase-repository";

function loadLocalEnvironmentIfNeeded(requiredNames: readonly string[]): void {
  if (requiredNames.every((name) => process.env[name]?.trim())) return;
  const environmentPath = resolve(process.cwd(), ".env.local");
  if (existsSync(environmentPath)) process.loadEnvFile(environmentPath);
}

function requireServerEnvironment(names: readonly string[]): void {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new KtoCatalogCollectionError(
      "CONFIGURATION",
      `Missing required server environment variables: ${missing.join(", ")}`,
    );
  }
}

export interface KtoCollectorCliDependencies {
  providerFactory(region: KtoCollectionEnabledRegionConfig<string>): KtoCatalogProvider;
  repositoryFactory(
    region: KtoCollectionEnabledRegionConfig<string>,
  ): KtoCatalogCollectionRepository;
  loadEnvironment(requiredNames: readonly string[]): void;
  output(value: unknown): void;
}

const DEFAULT_DEPENDENCIES: KtoCollectorCliDependencies = {
  providerFactory: () => createKtoCatalogProvider(),
  repositoryFactory: (region) => createSupabaseKtoCatalogRepository(region),
  loadEnvironment(requiredNames) {
    loadLocalEnvironmentIfNeeded(requiredNames);
    requireServerEnvironment(requiredNames);
  },
  output(value) {
    console.log(JSON.stringify(value));
  },
};

export async function runKtoCollectorCli(
  args: readonly string[],
  dependencies: Partial<KtoCollectorCliDependencies> = {},
): Promise<void> {
  const options = parseKtoCatalogCliArgs(args);
  const region = getKtoCollectionEnabledRegionConfig(options.regionId);
  if (!region) {
    throw new KtoCatalogCollectionError(
      "CONFIGURATION",
      `KTO collection is unavailable for region ${options.regionId}.`,
    );
  }
  if (process.env.CI) {
    throw new KtoCatalogCollectionError("CONFIGURATION", "Live KTO collection is disabled in CI.");
  }
  const resolved = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const requiredNames = options.mode === "apply"
    ? [
        "TOUR_API_SERVICE_KEY",
        "TOUR_API_BASE_URL",
        "NEXT_PUBLIC_SUPABASE_URL",
        "SUPABASE_SECRET_KEY",
      ]
    : ["TOUR_API_SERVICE_KEY", "TOUR_API_BASE_URL"];
  resolved.loadEnvironment(requiredNames);

  const provider = resolved.providerFactory(region);
  const result = await executeKtoCollection({
    region,
    ...options,
    provider,
    ...(options.mode === "apply"
      ? { repository: resolved.repositoryFactory(region) }
      : {}),
  });
  resolved.output({
    ok: true,
    region: region.id,
    mode: result.mode,
    scope: result.scope,
    audit: result.audit,
    database: result.database,
  });
}

async function main(): Promise<void> {
  try {
    await runKtoCollectorCli(process.argv.slice(2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      code: collectionErrorCode(error),
      reason:
        error instanceof KtoCatalogCollectionError
          ? error.message
          : "Regional KTO collector failed.",
    }));
    process.exitCode = 1;
  }
}

const directEntry = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (directEntry === import.meta.url) void main();
