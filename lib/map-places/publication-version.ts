import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { getRegionConfig } from "@/lib/regions/config";
import { createMapServiceSupabaseClient } from "@/lib/supabase/server";
import type {
  MapPlacesSnapshotDataset,
  MapPlacesSnapshotRequest,
} from "@/types/map-places-snapshot";
import type { PublicMapPlaceProvider } from "@/types/public-map-place";
import type { RegionId } from "@/types/region";

export type MapCatalogPublicationVersion = `p1-${string}`;

const runSchema = z.object({
  id: z.number().int().positive(),
  provider: z.enum(["tour", "kakao"]),
  completed_at: z.string().min(1),
});

export interface MapCatalogPublicationInput {
  region: RegionId;
  dataset: MapPlacesSnapshotDataset;
  providers: readonly PublicMapPlaceProvider[];
}

export function publicationInputForSnapshot(
  input: MapPlacesSnapshotRequest,
): MapCatalogPublicationInput {
  const region = getRegionConfig(input.region);
  return {
    region: input.region,
    dataset: input.dataset,
    providers: input.dataset === "shopping"
      ? ["tour"]
      : [...region.allowedMapProviders],
  };
}

export function mapCatalogPublicationKey(
  input: MapCatalogPublicationInput,
): string {
  return [
    input.region,
    input.dataset,
    [...input.providers].sort().join(","),
  ].join(":");
}

export function hashMapCatalogPublication(
  input: MapCatalogPublicationInput,
  runs: ReadonlyArray<z.infer<typeof runSchema>>,
): MapCatalogPublicationVersion {
  const hash = createHash("sha256");
  hash.update(`${mapCatalogPublicationKey(input)}\n`);
  for (const provider of [...input.providers].sort()) {
    const run = runs.find((candidate) => candidate.provider === provider);
    hash.update(`${provider}:${run?.id ?? "none"}:${run?.completed_at ?? "none"}\n`);
  }
  return `p1-${hash.digest("hex").slice(0, 16)}`;
}

async function queryLatestCompletedRun(
  region: RegionId,
  provider: PublicMapPlaceProvider,
): Promise<z.infer<typeof runSchema> | null> {
  const supabase = createMapServiceSupabaseClient();
  const { data, error } = await supabase
    .from("map_ingest_runs")
    .select("id,provider,completed_at")
    .eq("region_id", region)
    .eq("provider", provider)
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("지도 카탈로그 발행 버전을 확인하지 못했습니다.");
  return data ? runSchema.parse(data) : null;
}

export async function getMapCatalogPublicationVersion(
  input: MapCatalogPublicationInput,
): Promise<MapCatalogPublicationVersion> {
  const runs = (await Promise.all(
    input.providers.map((provider) => queryLatestCompletedRun(input.region, provider)),
  )).filter((run): run is z.infer<typeof runSchema> => run !== null);
  return hashMapCatalogPublication(input, runs);
}

export function createMapCatalogPublicationVersionResolver({
  resolve = getMapCatalogPublicationVersion,
}: {
  resolve?: typeof getMapCatalogPublicationVersion;
} = {}) {
  const inFlight = new Map<string, Promise<MapCatalogPublicationVersion>>();
  return (input: MapCatalogPublicationInput): Promise<MapCatalogPublicationVersion> => {
    const key = mapCatalogPublicationKey(input);
    const pending = inFlight.get(key);
    if (pending) return pending;
    const next = resolve(input).finally(() => {
      if (inFlight.get(key) === next) inFlight.delete(key);
    });
    inFlight.set(key, next);
    return next;
  };
}

export const resolveMapCatalogPublicationVersion =
  createMapCatalogPublicationVersionResolver();
