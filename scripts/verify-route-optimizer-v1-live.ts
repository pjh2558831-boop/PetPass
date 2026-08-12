import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runLiveRouteOptimizerV1 } from "@/scripts/lib/route-optimizer-live-adapter";
import {
  assertRouteOptimizerLiveVerificationAllowed,
  routeOptimizerLiveMarkdown,
  stringifyRouteOptimizerLiveArtifact,
} from "@/scripts/lib/route-optimizer-live-verification";
import { sanitizeDiagnosticText } from "@/scripts/lib/tour-contract-audit";

async function main(): Promise<void> {
  assertRouteOptimizerLiveVerificationAllowed(process.env, existsSync(".env.local"));
  process.loadEnvFile(".env.local");
  const required = ["TOUR_API_SERVICE_KEY", "TOUR_API_BASE_URL", "KAKAO_REST_API_KEY"] as const;
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) throw new Error(`LIVE_ROUTE_OPTIMIZER_CONFIGURATION_REQUIRED:${missing.join(",")}`);
  const report = await runLiveRouteOptimizerV1();
  const outputDirectory = resolve("verification-evidence", "route-optimizer-v1");
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(resolve(outputDirectory, "live-verification.json"), stringifyRouteOptimizerLiveArtifact(report), "utf8"),
    writeFile(resolve(outputDirectory, "live-verification.md"), routeOptimizerLiveMarkdown(report), "utf8"),
  ]);
  console.log(`LIVE_ROUTE_OPTIMIZER_CANDIDATES=${report.stage2.candidateCount}`);
  console.log(`LIVE_ROUTE_OPTIMIZER_STATUS=${report.solver.status}`);
  console.log(`LIVE_ROUTE_OPTIMIZER_GATE=${Object.values(report.gateChecks).every(Boolean) ? "PASS" : "LIMITED"}`);
}

void main().catch((error: unknown) => {
  console.error(sanitizeDiagnosticText(error instanceof Error ? error.message : error) ?? "LIVE_ROUTE_OPTIMIZER_FAILED");
  process.exitCode = 1;
});

