import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  renderTravelMatrixComparisonMarkdown,
  runControlledTravelMatrixComparison,
} from "@/scripts/lib/travel-matrix-comparison";

async function main(): Promise<void> {
  const outputDirectory = resolve(
    process.cwd(),
    "verification-evidence",
    "travel-matrix-v1",
  );
  const report = await runControlledTravelMatrixComparison();
  if (
    !report.deterministic ||
    !report.allColdStrategiesBeatNaivePairwise ||
    !report.allWarmReplaysReduceProviderCalls
  ) {
    throw new Error("CONTROLLED_TRAVEL_MATRIX_COMPARISON_FAILED");
  }
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    resolve(outputDirectory, "controlled-comparison.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    resolve(outputDirectory, "controlled-comparison.md"),
    renderTravelMatrixComparisonMarkdown(report),
    "utf8",
  );
  console.log(
    JSON.stringify({
      status: "passed",
      scenarios: report.scenarios.length,
      deterministic: report.deterministic,
      outputDirectory,
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Travel matrix comparison failed.");
  process.exitCode = 1;
});
