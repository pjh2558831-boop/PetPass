import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runLiveTravelMatrixV1 } from "@/scripts/lib/travel-matrix-live-adapter";
import {
  assertTravelMatrixLiveVerificationAllowed,
  stringifyTravelMatrixLiveArtifact,
  travelMatrixLiveMarkdown,
} from "@/scripts/lib/travel-matrix-live-verification";
import { sanitizeDiagnosticText } from "@/scripts/lib/tour-contract-audit";

async function main(): Promise<void> {
  assertTravelMatrixLiveVerificationAllowed(process.env, existsSync(".env.local"));
  process.loadEnvFile(".env.local");
  const required = [
    "TOUR_API_SERVICE_KEY",
    "TOUR_API_BASE_URL",
    "KAKAO_REST_API_KEY",
  ] as const;
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`LIVE_TRAVEL_MATRIX_CONFIGURATION_REQUIRED:${missing.join(",")}`);
  }
  const report = await runLiveTravelMatrixV1();
  const outputDirectory = resolve("verification-evidence", "travel-matrix-v1");
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(outputDirectory, "live-verification.json"),
      stringifyTravelMatrixLiveArtifact(report),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "live-verification.md"),
      travelMatrixLiveMarkdown(report),
      "utf8",
    ),
  ]);
  console.log(`LIVE_TRAVEL_MATRIX_NODES=${report.coldMatrix.nodeCount}`);
  console.log(
    `LIVE_TRAVEL_MATRIX_RESOLVED=${report.coldMatrix.resolvedEdges}/${report.coldMatrix.expectedDirectedEdges}`,
  );
  console.log(
    `LIVE_TRAVEL_MATRIX_KAKAO_CALLS=${report.kakaoBounds.providerCalls}/${report.kakaoBounds.requestCap}`,
  );
  console.log(
    `LIVE_TRAVEL_MATRIX_GATE=${Object.values(report.gateChecks).every(Boolean) ? "PASS" : "LIMITED"}`,
  );
}

void main().catch((error: unknown) => {
  console.error(
    sanitizeDiagnosticText(error instanceof Error ? error.message : error) ??
      "LIVE_TRAVEL_MATRIX_FAILED",
  );
  process.exitCode = 1;
});
