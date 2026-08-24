import "server-only";

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseJejuKtoCliArgs } from "@/lib/tour-api/collection/cli";
import { collectionErrorCode, JejuKtoCollectionError } from "@/lib/tour-api/collection/errors";
import { createKtoCatalogProvider } from "@/lib/tour-api/collection/provider";
import { executeJejuKtoCollection } from "@/lib/tour-api/collection/runner";
import { createSupabaseKtoCatalogRepository } from "@/lib/tour-api/collection/supabase-repository";

function loadLocalEnvironmentIfNeeded(requiredNames: readonly string[]): void {
  if (requiredNames.every((name) => process.env[name]?.trim())) return;
  const environmentPath = resolve(process.cwd(), ".env.local");
  if (existsSync(environmentPath)) process.loadEnvFile(environmentPath);
}

function requireServerEnvironment(names: readonly string[]): void {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new JejuKtoCollectionError(
      "CONFIGURATION",
      `Missing required server environment variables: ${missing.join(", ")}`,
    );
  }
}

export async function runJejuKtoCollectorCli(args: readonly string[]): Promise<void> {
  if (process.env.CI) {
    throw new JejuKtoCollectionError("CONFIGURATION", "Live KTO collection is disabled in CI.");
  }
  const options = parseJejuKtoCliArgs(args);
  const requiredNames = options.mode === "apply"
    ? ["TOUR_API_SERVICE_KEY", "TOUR_API_BASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"]
    : ["TOUR_API_SERVICE_KEY", "TOUR_API_BASE_URL"];
  loadLocalEnvironmentIfNeeded(requiredNames);
  requireServerEnvironment(requiredNames);

  const result = await executeJejuKtoCollection({
    ...options,
    provider: createKtoCatalogProvider(),
    ...(options.mode === "apply"
      ? { repository: createSupabaseKtoCatalogRepository() }
      : {}),
  });
  console.log(JSON.stringify({
    ok: true,
    mode: result.mode,
    scope: result.scope,
    audit: result.audit,
    database: result.database,
  }));
}

async function main(): Promise<void> {
  try {
    await runJejuKtoCollectorCli(process.argv.slice(2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      code: collectionErrorCode(error),
      reason:
        error instanceof JejuKtoCollectionError
          ? error.message
          : "Jeju KTO collector failed.",
    }));
    process.exitCode = 1;
  }
}

const directEntry = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (directEntry === import.meta.url) void main();
