import "server-only";

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  KtoCatalogCollectionError,
  collectionErrorCode,
} from "@/lib/tour-api/collection/errors";
import {
  runKtoCollectorCli,
  type KtoCollectorCliDependencies,
} from "@/scripts/collect-kto-v1";

/** Backward-compatible entry point retained for the Phase 3/4 Jeju commands. */
export function runJejuKtoCollectorCli(
  args: readonly string[],
  dependencies: Partial<KtoCollectorCliDependencies> = {},
): Promise<void> {
  return runKtoCollectorCli(["--region=jeju", ...args], dependencies);
}

async function main(): Promise<void> {
  try {
    await runJejuKtoCollectorCli(process.argv.slice(2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      code: collectionErrorCode(error),
      reason:
        error instanceof KtoCatalogCollectionError
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
