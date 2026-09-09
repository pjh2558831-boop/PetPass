import { existsSync } from "node:fs";
import { z } from "zod";
import { queryPublicMapCatalog } from "@/lib/map-places/public-catalog";
import { REGION_CONFIGS } from "@/lib/regions/config";
import { createMapServiceSupabaseClient } from "@/lib/supabase/server";
import { scanInventoryPartition } from "./lib/registered-place-inventory";

const rawRow = z.object({
  id: z.number().int().positive(), provider: z.enum(["tour", "kakao"]), provider_place_id: z.string(),
  region_id: z.string().nullable(), is_active: z.boolean(), public_visibility: z.boolean().nullable(),
  review_status: z.string().nullable(), lifecycle_status: z.string().nullable(), provider_visibility: z.string().nullable(),
});

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && !["--plan", "--dry-run"].includes(args[0]))) throw new Error("unsupported_mode");
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const client = createMapServiceSupabaseClient();
  const startedAt = new Date().toISOString();
  const publishedIds = new Set<string>();
  const partitions = [];
  let requests = 0;
  const signal = AbortSignal.timeout(15 * 60_000);
  function requestSignal() {
    if (++requests > 2000) throw new Error("request_budget_exhausted");
    signal.throwIfAborted();
    return AbortSignal.any([signal, AbortSignal.timeout(8000)]);
  }
  for (const region of REGION_CONFIGS) {
    for (const dataset of region.mapCatalog.snapshotDatasets) {
      for (const provider of dataset === "shopping" ? ["tour" as const] : region.allowedMapProviders) {
        try {
          const result = await scanInventoryPartition(afterId => queryPublicMapCatalog({
            regionId: region.id, dataset, providers: [provider], page: 1, pageSize: 200,
            ...(afterId === undefined ? {} : { afterId }), signal: requestSignal(),
          }));
          if (result.ids.some(id => publishedIds.has(id))) throw new Error("duplicate_partition_identity");
          result.ids.forEach(id => publishedIds.add(id));
          partitions.push({ region: region.id, provider, dataset, status: "complete", count: result.count, categories: result.categories, pages: result.pages });
        } catch {
          partitions.push({ region: region.id, provider, dataset, status: "unavailable" });
        }
      }
    }
  }
  const registered: Record<string, { count: number; notInPublicScan: number; inactive: number; rejected: number; hidden: number; nonCurrent: number; providerNotExposed: number }> = {};
  let cursor = 0;
  let rawComplete = false;
  try {
    for (let page = 0; page < 1000; page++) {
      const { data, error } = await client.from("map_places")
        .select("id,provider,provider_place_id,region_id,is_active,public_visibility,review_status,lifecycle_status,provider_visibility")
        .gt("id", cursor).order("id").limit(200).abortSignal(requestSignal());
      if (error) throw new Error("registered_inventory_unavailable");
      const rows = rawRow.array().parse(data);
      for (const row of rows) {
        if (row.id <= cursor) throw new Error("registered_cursor_not_advancing");
        cursor = row.id;
        const group = registered[`${row.region_id ?? "unknown"}:${row.provider}`] ??= { count: 0, notInPublicScan: 0, inactive: 0, rejected: 0, hidden: 0, nonCurrent: 0, providerNotExposed: 0 };
        group.count++;
        if (!publishedIds.has(`${row.provider}:${row.provider_place_id}`)) group.notInPublicScan++;
        if (!row.is_active) group.inactive++;
        if (row.review_status === "rejected") group.rejected++;
        if (row.provider === "kakao" && row.public_visibility === false) group.hidden++;
        if (row.lifecycle_status && row.lifecycle_status !== "current") group.nonCurrent++;
        if (row.provider === "tour" && row.provider_visibility !== "exposed") group.providerNotExposed++;
      }
      if (rows.length < 200) { rawComplete = true; break; }
    }
  } catch { /* Aggregate partial evidence only; never print upstream responses or credentials. */ }
  const complete = rawComplete && partitions.every(partition => partition.status === "complete");
  console.log(JSON.stringify({ mode: "external_link_only", startedAt, finishedAt: new Date().toISOString(), complete,
    publicCount: complete ? publishedIds.size : null, observedPublicCount: publishedIds.size, registeredComplete: rawComplete,
    registered, partitions, catalogRequests: requests, naverRequests: 0, publishedPhotos: 0,
    notes: ["Registered status counts overlap; notInPublicScan is conclusive only when complete=true.", "Image URL presence is not photo validity or rights clearance.", "Read-only sequential scan; concurrent publication can require a rerun."] }, null, 2));
  if (!complete) process.exitCode = 1;
}
main().catch(() => {
  console.error("집계 실패: 환경 설정·읽기 권한 또는 명령을 확인하세요. 허용 모드: --plan, --dry-run");
  process.exitCode = 1;
});
