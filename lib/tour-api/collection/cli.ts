import "server-only";

import type {
  KtoCatalogExecutionMode,
  KtoCatalogRunId,
  KtoCatalogRunScope,
} from "@/lib/tour-api/collection/contracts";
import { JejuKtoCollectionError } from "@/lib/tour-api/collection/errors";

export interface JejuKtoCliOptions {
  mode: KtoCatalogExecutionMode;
  scope: KtoCatalogRunScope;
  resumeRunId?: KtoCatalogRunId;
}

export function parseJejuKtoCliArgs(args: readonly string[]): JejuKtoCliOptions {
  let mode: KtoCatalogExecutionMode = "dry-run";
  let scope: KtoCatalogRunScope = "full";
  let explicitMode = false;
  let resumeRunId: string | undefined;

  for (const arg of args) {
    if (arg === "--dry-run" || arg === "--apply") {
      if (explicitMode) {
        throw new JejuKtoCollectionError("CONFIGURATION", "Choose exactly one collector mode.");
      }
      explicitMode = true;
      mode = arg === "--apply" ? "apply" : "dry-run";
      continue;
    }
    if (arg === "--scope=full" || arg === "--scope=delta") {
      scope = arg.endsWith("delta") ? "delta" : "full";
      continue;
    }
    if (arg.startsWith("--resume=")) {
      resumeRunId = arg.slice("--resume=".length);
      if (!/^[1-9][0-9]*$/u.test(resumeRunId)) {
        throw new JejuKtoCollectionError("CONFIGURATION", "Invalid resume run identifier.");
      }
      continue;
    }
    throw new JejuKtoCollectionError("CONFIGURATION", `Unknown collector option: ${arg}`);
  }
  if (resumeRunId && mode !== "apply") {
    throw new JejuKtoCollectionError(
      "CONFIGURATION",
      "Resume requires explicit --apply mode.",
    );
  }
  return { mode, scope, ...(resumeRunId ? { resumeRunId } : {}) };
}
