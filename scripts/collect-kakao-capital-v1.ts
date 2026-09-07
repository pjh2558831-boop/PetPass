import "server-only";
import { capitalRegionQueries } from "@/lib/kakao/collection/query-registry-capital-v1";
import { createKakaoBusanCollectorAdapter } from "@/lib/kakao/collection/collector-adapter";
import { createKakaoCollectionProvider } from "@/lib/kakao/collection/provider";
import { createSupabaseKakaoCollectionRepository } from "@/lib/kakao/collection/supabase-repository";
import { executeKakaoCollection } from "@/lib/kakao/collection/runner";
import { collectionErrorCode } from "@/lib/kakao/collection/errors";
import { getRegionConfig } from "@/lib/regions/config";

async function main() {
  const args = process.argv.slice(2);
  const regionId = args.shift();
  if (regionId !== "gyeonggi" && regionId !== "incheon" && regionId !== "gangwon" && regionId !== "chungbuk" && regionId !== "chungnam" && regionId !== "gyeongbuk" && regionId !== "gyeongnam" && regionId !== "jeonbuk" && regionId !== "jeonnam" && regionId !== "daejeon" && regionId !== "daegu" && regionId !== "gwangju" && regionId !== "ulsan" && regionId !== "sejong") throw new Error("Unsupported collection region");
  const region = getRegionConfig(regionId);
  const expected = { gyeonggi: 961, incheon: 341, gangwon: 558, chungbuk: 341, chungnam: 465, gyeongbuk: 682, gyeongnam: 558, jeonbuk: 434, jeonnam: 682, daejeon: 155, daegu: 279, gwangju: 155, ulsan: 155, sejong: 31 }[regionId];
  const mode = args[0];
  if (!(["--plan", "--dry-run", "--apply", "--resume"].includes(mode)) ||
    (mode === "--resume" ? args.length !== 2 || !/^\d+$/.test(args[1]) : args.length !== 1)) {
    throw new Error("Use --plan, --dry-run, --apply, or --resume <runId>");
  }
  const plan = capitalRegionQueries(regionId);
  if (plan.length !== expected || new Set(plan.map((q) => q.key)).size !== expected ||
      region.districts.filter(d => (regionId !== "chungbuk" || d.legalDongDistrictCode !== "009") && (regionId !== "gyeongnam" || !["006", "014"].includes(d.legalDongDistrictCode))).some((d) => plan.filter((q) => q.districtCode === d.legalDongDistrictCode).length !== 31)) {
    throw new Error("Invalid regional registry");
  }
  console.log(JSON.stringify({ region: regionId, queries: expected, districts: new Set(plan.map(q => q.districtCode)).size, maximumInitialCalls: expected * 3, executionCallCap: 1500 }));
  if (mode === "--plan") return;
  const source = mode === "--dry-run" ? plan.filter((q) => q.templateIndex === 0) : plan;
  const adapter = createKakaoBusanCollectorAdapter(source, region);
  const summary = await executeKakaoCollection({
    mode: mode === "--dry-run" ? "dry-run" : mode === "--resume" ? "resume" : "apply",
    registryVersion: `kakao-${regionId}-query-registry-v1`,
    ...adapter,
    provider: createKakaoCollectionProvider(),
    ...(mode === "--dry-run" ? {} : { repository: createSupabaseKakaoCollectionRepository(regionId) }),
    resumeRunId: mode === "--resume" ? args[1] : undefined,
    isFullCatalogRun: true,
    coordinateBounds: region.mapBounds,
    allowResumablePlan: true,
  });
  console.log(JSON.stringify(summary));
  if (summary.status !== "completed") process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, code: collectionErrorCode(error) }));
  process.exitCode = 1;
});
