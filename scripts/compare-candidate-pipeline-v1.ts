import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  controlledComparisonMarkdown,
  createControlledComparisonReport,
} from "@/scripts/lib/candidate-pipeline-comparison";
import { runControlledCandidatePipelineV1 } from "@/scripts/lib/candidate-pipeline-controlled-adapter";
import {
  sanitizeDiagnosticText,
  stringifySanitizedArtifact,
} from "@/scripts/lib/tour-contract-audit";

const OUTPUT_DIRECTORY = resolve(
  "verification-evidence",
  "candidate-pipeline-v1",
);

async function main(): Promise<void> {
  const report = await createControlledComparisonReport(
    runControlledCandidatePipelineV1,
  );
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(OUTPUT_DIRECTORY, "controlled-comparison.json"),
      stringifySanitizedArtifact(report),
      "utf8",
    ),
    writeFile(
      resolve(OUTPUT_DIRECTORY, "controlled-comparison.md"),
      controlledComparisonMarkdown(report),
      "utf8",
    ),
  ]);
  console.log(`CONTROLLED_SCENARIOS=${report.scenarioCount}`);
  console.log(
    `CONTROLLED_LEGACY_ELIGIBLE=${report.summary.legacyEligibleDiscovered}`,
  );
  console.log(
    `CONTROLLED_STAGE2_ELIGIBLE=${report.summary.stage2EligibleDiscovered}`,
  );
  console.log(
    `CONTROLLED_STAGE2_DETERMINISTIC=${report.summary.deterministicStage2Output}`,
  );
}

main().catch((error: unknown) => {
  console.error(
    sanitizeDiagnosticText(error instanceof Error ? error.message : error) ??
      "CONTROLLED_COMPARISON_FAILED",
  );
  process.exitCode = 1;
});

