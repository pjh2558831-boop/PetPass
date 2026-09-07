import "server-only";
import { KAKAO_SEOUL_COLLECTION_QUERIES, KAKAO_SEOUL_QUERY_REGISTRY_VERSION } from "@/lib/kakao/collection/query-registry-seoul-v1";
import { createKakaoBusanCollectorAdapter } from "@/lib/kakao/collection/collector-adapter";
import { createKakaoCollectionProvider } from "@/lib/kakao/collection/provider";
import { createSupabaseKakaoCollectionRepository } from "@/lib/kakao/collection/supabase-repository";
import { executeKakaoCollection } from "@/lib/kakao/collection/runner";
import { collectionErrorCode } from "@/lib/kakao/collection/errors";
import { SEOUL_REGION_CONFIG } from "@/lib/regions/config";

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  if (!(["--plan", "--dry-run", "--apply", "--resume"].includes(mode)) ||
    (mode === "--resume" ? args.length !== 2 || !/^\d+$/.test(args[1]) : args.length !== 1)) {
    throw new Error("Use --plan, --dry-run, --apply, or --resume <runId>");
  }
  const plan = KAKAO_SEOUL_COLLECTION_QUERIES;
  if (plan.length !== 775 || new Set(plan.map((q) => q.key)).size !== 775 ||
      SEOUL_REGION_CONFIG.districts.some((d) => plan.filter((q) => q.districtCode === d.legalDongDistrictCode).length !== 31)) {
    throw new Error("Invalid Seoul registry");
  }
  console.log(JSON.stringify({ region: "seoul", queries: 775, districts: 25, maximumInitialCalls: 2325, executionCallCap: 1500 }));
  if (mode === "--plan") return;
  const source = mode === "--dry-run" ? plan.filter((q) => q.templateIndex === 0) : plan;
  const adapter = createKakaoBusanCollectorAdapter(source, SEOUL_REGION_CONFIG);
  const summary = await executeKakaoCollection({
    mode: mode === "--dry-run" ? "dry-run" : mode === "--resume" ? "resume" : "apply",
    registryVersion: KAKAO_SEOUL_QUERY_REGISTRY_VERSION,
    ...adapter,
    provider: createKakaoCollectionProvider(),
    ...(mode === "--dry-run" ? {} : { repository: createSupabaseKakaoCollectionRepository("seoul") }),
    resumeRunId: mode === "--resume" ? args[1] : undefined,
    isFullCatalogRun: true,
    coordinateBounds: SEOUL_REGION_CONFIG.mapBounds,
    allowResumablePlan: true,
  });
  console.log(JSON.stringify(summary));
  if (summary.status !== "completed") process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, code: collectionErrorCode(error) }));
  process.exitCode = 1;
});
