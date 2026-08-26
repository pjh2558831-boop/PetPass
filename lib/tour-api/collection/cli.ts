import "server-only";

import type {
  KtoCatalogExecutionMode,
  KtoCatalogRunId,
  KtoCatalogRunScope,
} from "@/lib/tour-api/collection/contracts";
import { KtoCatalogCollectionError } from "@/lib/tour-api/collection/errors";

export interface KtoCatalogCliOptions {
  regionId: string;
  mode: KtoCatalogExecutionMode;
  scope: KtoCatalogRunScope;
  resumeRunId?: KtoCatalogRunId;
}

export interface JejuKtoCliOptions {
  mode: KtoCatalogExecutionMode;
  scope: KtoCatalogRunScope;
  resumeRunId?: KtoCatalogRunId;
}

export function parseKtoCatalogCliArgs(args: readonly string[]): KtoCatalogCliOptions {
  let regionId: string | undefined;
  let mode: KtoCatalogExecutionMode = "dry-run";
  let scope: KtoCatalogRunScope = "full";
  let explicitMode = false;
  let explicitScope = false;
  let resumeRunId: string | undefined;

  for (const arg of args) {
    if (arg.startsWith("--region=")) {
      if (regionId !== undefined) {
        throw new KtoCatalogCollectionError("CONFIGURATION", "Choose exactly one region.");
      }
      regionId = arg.slice("--region=".length).trim();
      if (!/^[a-z][a-z0-9_-]*$/u.test(regionId)) {
        throw new KtoCatalogCollectionError("CONFIGURATION", "Invalid region identifier.");
      }
      continue;
    }
    if (arg === "--dry-run" || arg === "--apply") {
      if (explicitMode) {
        throw new KtoCatalogCollectionError(
          "CONFIGURATION",
          "Choose exactly one collector mode.",
        );
      }
      explicitMode = true;
      mode = arg === "--apply" ? "apply" : "dry-run";
      continue;
    }
    if (arg === "--scope=full" || arg === "--scope=delta") {
      if (explicitScope) {
        throw new KtoCatalogCollectionError("CONFIGURATION", "Choose exactly one run scope.");
      }
      explicitScope = true;
      scope = arg.endsWith("delta") ? "delta" : "full";
      continue;
    }
    if (arg.startsWith("--resume=")) {
      if (resumeRunId !== undefined) {
        throw new KtoCatalogCollectionError(
          "CONFIGURATION",
          "Choose exactly one resume run identifier.",
        );
      }
      resumeRunId = arg.slice("--resume=".length);
      if (!/^[1-9][0-9]*$/u.test(resumeRunId)) {
        throw new KtoCatalogCollectionError("CONFIGURATION", "Invalid resume run identifier.");
      }
      continue;
    }
    throw new KtoCatalogCollectionError("CONFIGURATION", `Unknown collector option: ${arg}`);
  }
  if (!regionId) {
    throw new KtoCatalogCollectionError("CONFIGURATION", "Region is required (--region=<id>).");
  }
  if (resumeRunId && mode !== "apply") {
    throw new KtoCatalogCollectionError(
      "CONFIGURATION",
      "Resume requires explicit --apply mode.",
    );
  }
  return { regionId, mode, scope, ...(resumeRunId ? { resumeRunId } : {}) };
}

/** Backward-compatible parser for the documented Jeju aliases. */
export function parseJejuKtoCliArgs(args: readonly string[]): JejuKtoCliOptions {
  const options = parseKtoCatalogCliArgs([
    "--region=jeju",
    ...args,
  ]);
  return {
    mode: options.mode,
    scope: options.scope,
    ...(options.resumeRunId ? { resumeRunId: options.resumeRunId } : {}),
  };
}
