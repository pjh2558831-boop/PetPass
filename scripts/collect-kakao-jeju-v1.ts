import "server-only";
import { KAKAO_JEJU_COLLECTION_QUERIES, KAKAO_JEJU_QUERY_REGISTRY_VERSION } from "@/lib/kakao/collection/query-registry-jeju-v1";
import { createKakaoBusanCollectorAdapter } from "@/lib/kakao/collection/collector-adapter";
import { createKakaoCollectionProvider } from "@/lib/kakao/collection/provider";
import { createSupabaseKakaoCollectionRepository } from "@/lib/kakao/collection/supabase-repository";
import { executeKakaoCollection } from "@/lib/kakao/collection/runner";
import { collectionErrorCode } from "@/lib/kakao/collection/errors";
import { JEJU_REGION_CONFIG } from "@/lib/regions/config";

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  if (!(["--plan", "--dry-run", "--apply", "--resume"].includes(mode)) ||
    (mode === "--resume" ? args.length !== 2 || !/^\d+$/.test(args[1]) : args.length !== 1)) {
    throw new Error("Use --plan, --dry-run, --apply, or --resume <runId>");
  }
  const plan = KAKAO_JEJU_COLLECTION_QUERIES;
  if (plan.length !== 62 || new Set(plan.map((q) => q.key)).size !== 62 ||
      JEJU_REGION_CONFIG.districts.some((d) => plan.filter((q) => q.districtCode === d.legalDongDistrictCode).length !== 31)) {
    throw new Error("Invalid Jeju registry");
  }
  console.log(JSON.stringify({ region: "jeju", queries: 62, districts: 2, maximumInitialCalls: 186, executionCallCap: 1500 }));
  if (mode === "--plan") return;
  const source = mode === "--dry-run" ? plan.filter((q) => q.templateIndex === 0) : plan;
  const adapter = createKakaoBusanCollectorAdapter(source, JEJU_REGION_CONFIG);
  const summary = await executeKakaoCollection({
    mode: mode === "--dry-run" ? "dry-run" : mode === "--resume" ? "resume" : "apply",
    registryVersion: KAKAO_JEJU_QUERY_REGISTRY_VERSION,
    ...adapter,
    provider: createKakaoCollectionProvider(),
    ...(mode === "--dry-run" ? {} : { repository: createSupabaseKakaoCollectionRepository("jeju") }),
    resumeRunId: mode === "--resume" ? args[1] : undefined,
    isFullCatalogRun: true,
    coordinateBounds: JEJU_REGION_CONFIG.mapBounds,
    allowResumablePlan: true,
  });
  console.log(JSON.stringify(summary));
  if (summary.status !== "completed") process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, code: collectionErrorCode(error) }));
  process.exitCode = 1;
});
