import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runLiveCandidatePipelineV1 } from "@/scripts/lib/candidate-pipeline-live-adapter";
import {
  assertCandidatePipelineLiveVerificationAllowed,
  candidatePipelineLiveMarkdown,
  createCandidatePipelineLiveVerificationReport,
  stringifyCandidatePipelineLiveArtifact,
} from "@/scripts/lib/candidate-pipeline-live-verification";
import { sanitizeDiagnosticText } from "@/scripts/lib/tour-contract-audit";

const OUTPUT_DIRECTORY = resolve(
  "verification-evidence",
  "candidate-pipeline-v1",
);

function loadProviderEnvironment(): void {
  process.loadEnvFile(".env.local");
  const required = ["TOUR_API_SERVICE_KEY", "TOUR_API_BASE_URL"] as const;
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `LIVE_CANDIDATE_PIPELINE_CONFIGURATION_REQUIRED:${missing.join(",")}`,
    );
  }
}

async function main(): Promise<void> {
  const localEnvironmentFileExists = existsSync(".env.local");
  assertCandidatePipelineLiveVerificationAllowed(
    process.env,
    localEnvironmentFileExists,
  );
  loadProviderEnvironment();

  const execution = await runLiveCandidatePipelineV1();
  const report = createCandidatePipelineLiveVerificationReport(execution);
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(OUTPUT_DIRECTORY, "live-verification.json"),
      stringifyCandidatePipelineLiveArtifact(report),
      "utf8",
    ),
    writeFile(
      resolve(OUTPUT_DIRECTORY, "live-verification.md"),
      candidatePipelineLiveMarkdown(report),
      "utf8",
    ),
  ]);
  console.log(`LIVE_CANDIDATE_SCENARIOS=${report.coldScenarios.length}`);
  console.log(
    `LIVE_CANDIDATE_MAX_ELIGIBLE=${Math.max(0, ...report.coldScenarios.map(({ diagnostics }) => diagnostics.finalEligibleCount))}`,
  );
  console.log(
    `LIVE_CANDIDATE_STAGE1_REDISCOVERED=${report.naturallyRediscoveredSampleIds.length}/${report.expectedSampleIds.length}`,
  );
  console.log(
    `LIVE_CANDIDATE_PROVIDER_CALLS=${report.totalPhysicalProviderCalls}/${report.bounds.requestCap}`,
  );
  console.log(
    `LIVE_CANDIDATE_WARM_PROVIDER_CALLS=${report.warmPhysicalProviderCalls}`,
  );
  console.log(`LIVE_CANDIDATE_GATE_CHECKS=${Object.values(report.gateChecks).every(Boolean) ? "PASS" : "FAIL"}`);
}

main().catch((error: unknown) => {
  console.error(
    sanitizeDiagnosticText(error instanceof Error ? error.message : error) ??
      "LIVE_CANDIDATE_PIPELINE_FAILED",
  );
  process.exitCode = 1;
});
