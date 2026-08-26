import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  JEJU_REGION_CONFIG,
  coordinatesInRegion,
  type KtoCollectionEnabledRegionConfig,
} from "@/lib/regions/config";
import {
  KTO_CATALOG_PROVIDER,
  type KtoCatalogCollectionRepository,
  type KtoCatalogDistrictAudit,
  type KtoCatalogDistrictCollection,
  type KtoCatalogMapPlace,
  type KtoCatalogRunId,
  type KtoCatalogRunScopeInput,
} from "@/lib/tour-api/collection/contracts";
import { KtoCatalogCollectionError } from "@/lib/tour-api/collection/errors";

const PETPASS_SUPABASE_PROJECT_REF = "inucorualcworpzqxjiu";

const mapPlaceSchema = z.object({
  region_id: z.string().regex(/^[a-z][a-z0-9_-]*$/u),
  provider: z.literal(KTO_CATALOG_PROVIDER),
  provider_place_id: z.string().regex(/^[1-9][0-9]*$/u),
  name: z.string().min(1),
  category_group: z.enum([
    "attraction",
    "culture",
    "festival",
    "leisure",
    "accommodation",
    "food",
  ]),
  category_code: z.string().nullable(),
  content_type_id: z.union([
    z.literal(12),
    z.literal(14),
    z.literal(15),
    z.literal(28),
    z.literal(32),
    z.literal(39),
  ]),
  road_address: z.string().nullable(),
  lot_address: z.string().nullable(),
  district_code: z.string().regex(/^\d{3}$/u),
  district_name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  phone: z.string().nullable(),
  image_url: z.string().nullable(),
  source_url: z.string().nullable(),
  provider_visibility: z.enum([
    "exposed",
    "not_exposed",
    "unknown",
    "provider_unavailable",
  ]),
  pet_evidence_status: z.enum(["official_verified", "official_unknown"]),
  pet_evidence: z.record(z.unknown()),
  pet_notes: z.string(),
  fetched_at: z.string().datetime({ offset: true }),
});

const districtAuditSchema = z.object({
  districtCode: z.string().regex(/^\d{3}$/u),
  districtName: z.string().min(1),
  rawCount: z.number().int().nonnegative(),
  acceptedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  imageCoveredCount: z.number().int().nonnegative(),
  detailPetTourCoveredCount: z.number().int().nonnegative(),
  rawContentTypeCounts: z.record(z.number().int().nonnegative()),
  categoryCounts: z.record(z.number().int().nonnegative()),
  verdictCounts: z.record(z.number().int().nonnegative()),
  rejectionCounts: z.record(z.number().int().nonnegative()),
  missingFieldCounts: z.object({
    address: z.number().int().nonnegative(),
    phone: z.number().int().nonnegative(),
    image: z.number().int().nonnegative(),
    detailPetTour: z.number().int().nonnegative(),
  }),
});

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new KtoCatalogCollectionError(
      "CONFIGURATION",
      `Missing required server environment variable: ${name}`,
    );
  }
  return value;
}

function petPassSupabaseUrl(): string {
  const value = requiredEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new KtoCatalogCollectionError("CONFIGURATION", "Invalid Supabase project URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== `${PETPASS_SUPABASE_PROJECT_REF}.supabase.co`
  ) {
    throw new KtoCatalogCollectionError("CONFIGURATION", "Unexpected Supabase project URL.");
  }
  return url.origin;
}

function safeRunId(value: KtoCatalogRunId): string {
  const normalized = String(value).trim();
  if (!/^[1-9][0-9]*$/u.test(normalized)) {
    throw new KtoCatalogCollectionError("CONFIGURATION", "Invalid KTO run identifier.");
  }
  return normalized;
}

function expectedDistricts(region: KtoCollectionEnabledRegionConfig<string>) {
  return new Map(region.districts.map((district) => [
    district.legalDongDistrictCode,
    district.name,
  ]));
}

function assertScope(
  region: KtoCollectionEnabledRegionConfig<string>,
  input: KtoCatalogRunScopeInput,
): void {
  const expected = expectedDistricts(region);
  const uniqueInput = new Set(input.districtCodes);
  if (
    input.regionId !== region.id ||
    input.provider !== KTO_CATALOG_PROVIDER ||
    input.registryVersion !== region.ktoCollection.registryVersion ||
    input.districtCodes.length !== expected.size ||
    uniqueInput.size !== expected.size ||
    [...expected.keys()].some((code) => !uniqueInput.has(code))
  ) {
    throw new KtoCatalogCollectionError("CONFIGURATION", "Invalid regional KTO run scope.");
  }
}

function rowObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

function databaseFailure(): KtoCatalogCollectionError {
  return new KtoCatalogCollectionError(
    "DATABASE_FAILURE",
    "The regional KTO catalog repository rejected the operation.",
  );
}

export function createSupabaseKtoCatalogRepository(
  region: KtoCollectionEnabledRegionConfig<string> = JEJU_REGION_CONFIG,
): KtoCatalogCollectionRepository {
  const districtNames = expectedDistricts(region);
  const supabase = createClient(
    petPassSupabaseUrl(),
    requiredEnvironmentValue("SUPABASE_SECRET_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          "X-Client-Info": `petpass-${region.ktoCollection.cacheNamespace}-collector`,
        },
      },
    },
  );

  async function loadCompletedDistricts(runId: KtoCatalogRunId) {
    const id = safeRunId(runId);
    const { data: checkpointData, error: checkpointError } = await supabase
      .from("map_tour_ingest_checkpoints")
      .select("district_code,district_name,audit")
      .eq("region_id", region.id)
      .eq("provider", KTO_CATALOG_PROVIDER)
      .eq("collection_run_id", id);
    if (checkpointError || !Array.isArray(checkpointData)) throw databaseFailure();

    const completed: KtoCatalogDistrictCollection[] = [];
    for (const checkpointValue of checkpointData) {
      const checkpoint = rowObject(checkpointValue);
      const audit = districtAuditSchema.safeParse(checkpoint?.audit);
      const districtCode = typeof checkpoint?.district_code === "string"
        ? checkpoint.district_code
        : null;
      const districtName = districtCode ? districtNames.get(districtCode) : null;
      if (
        !checkpoint ||
        !districtCode ||
        !districtName ||
        checkpoint.district_name !== districtName ||
        !audit.success ||
        audit.data.districtCode !== districtCode ||
        audit.data.districtName !== districtName
      ) {
        throw databaseFailure();
      }
      const { data: stageData, error: stageError } = await supabase
        .from("map_tour_ingest_stage_places")
        .select(
          "region_id,provider,provider_place_id,name,category_group,category_code,content_type_id,road_address,lot_address,district_code,district_name,latitude,longitude,phone,image_url,source_url,provider_visibility,pet_evidence_status,pet_evidence,pet_notes,fetched_at",
        )
        .eq("region_id", region.id)
        .eq("provider", KTO_CATALOG_PROVIDER)
        .eq("collection_run_id", id)
        .eq("district_code", districtCode);
      if (stageError || !Array.isArray(stageData)) throw databaseFailure();
      const parsedRows = z.array(mapPlaceSchema).safeParse(stageData);
      if (
        !parsedRows.success ||
        parsedRows.data.length !== audit.data.acceptedCount ||
        parsedRows.data.some((row) =>
          row.region_id !== region.id ||
          row.district_code !== districtCode ||
          row.district_name !== districtName ||
          !coordinatesInRegion(region, {
            latitude: row.latitude,
            longitude: row.longitude,
          }))
      ) {
        throw databaseFailure();
      }
      completed.push({
        districtCode,
        rows: parsedRows.data as KtoCatalogMapPlace[],
        audit: audit.data as KtoCatalogDistrictAudit,
      });
    }
    return completed;
  }

  return {
    async startRun(input) {
      assertScope(region, input);
      const { data, error } = await supabase.rpc("start_tour_catalog_run_v1", {
        p_region_id: input.regionId,
        p_registry_version: input.registryVersion,
        p_collector_version: input.collectorVersion,
        p_run_scope: input.scope,
        p_district_codes: input.districtCodes,
        p_started_at: input.startedAt,
      });
      const result = Array.isArray(data) ? rowObject(data[0]) : rowObject(data);
      const runId = result?.run_id;
      if (
        error ||
        (typeof runId !== "number" && typeof runId !== "string") ||
        result?.planned_district_count !== region.districts.length
      ) {
        throw databaseFailure();
      }
      return {
        runId,
        completedDistrictCodes: new Set<string>(),
        completedDistricts: [],
      };
    },

    async resumeRun(input) {
      assertScope(region, input);
      const id = safeRunId(input.runId);
      const { data, error } = await supabase
        .from("map_ingest_runs")
        .select("id,region_id,provider,status,registry_version,is_full_catalog_run,planned_query_count")
        .eq("id", id)
        .eq("region_id", input.regionId)
        .eq("provider", input.provider)
        .single();
      const run = rowObject(data);
      if (
        error ||
        !run ||
        !["running", "partial", "failed"].includes(String(run.status)) ||
        run.registry_version !== input.registryVersion ||
        run.planned_query_count !== region.districts.length ||
        run.is_full_catalog_run !== (input.scope === "full")
      ) {
        throw databaseFailure();
      }
      if (run.status !== "running") {
        const { error: updateError } = await supabase
          .from("map_ingest_runs")
          .update({ status: "running", completed_at: null, sanitized_error_summary: null })
          .eq("id", id)
          .eq("region_id", input.regionId)
          .eq("provider", input.provider)
          .eq("status", run.status);
        if (updateError) throw databaseFailure();
      }
      const completedDistricts = await loadCompletedDistricts(id);
      return {
        runId: id,
        completedDistrictCodes: new Set(
          completedDistricts.map(({ districtCode }) => districtCode),
        ),
        completedDistricts,
      };
    },

    async checkpointDistrict(input) {
      assertScope(region, input);
      const districtName = districtNames.get(input.districtCode);
      if (
        !districtName ||
        input.audit.districtCode !== input.districtCode ||
        input.audit.districtName !== districtName ||
        input.rows.length !== input.audit.acceptedCount ||
        input.rows.some((row) =>
          row.region_id !== input.regionId ||
          row.provider !== input.provider ||
          row.district_code !== input.districtCode ||
          row.district_name !== districtName ||
          !coordinatesInRegion(region, {
            latitude: row.latitude,
            longitude: row.longitude,
          }))
      ) {
        throw databaseFailure();
      }
      const { error } = await supabase.rpc("commit_tour_catalog_checkpoint_v1", {
        p_run_id: safeRunId(input.runId),
        p_district_code: input.districtCode,
        p_rows: input.rows,
        p_audit: input.audit,
        p_completed_at: input.completedAt,
      });
      if (error) throw databaseFailure();
    },

    async markFailed(input) {
      if (
        input.regionId !== region.id ||
        input.provider !== KTO_CATALOG_PROVIDER
      ) {
        throw new KtoCatalogCollectionError(
          "CONFIGURATION",
          "Invalid regional KTO failure scope.",
        );
      }
      const { error } = await supabase.rpc("finalize_tour_catalog_run_v1", {
        p_run_id: safeRunId(input.runId),
        p_status: "failed",
        p_sanitized_error_summary: JSON.stringify({
          regionId: input.regionId,
          provider: input.provider,
          code: input.errorCode,
        }).slice(0, 1_000),
        p_completed_at: input.completedAt,
      });
      if (error) throw databaseFailure();
    },

    async finalizeCompletedRun(input) {
      assertScope(region, input);
      if (
        input.audit.regionId !== region.id ||
        input.audit.registryVersion !== input.registryVersion
      ) {
        throw databaseFailure();
      }
      const { data, error } = await supabase.rpc("finalize_tour_catalog_run_v1", {
        p_run_id: safeRunId(input.runId),
        p_status: "completed",
        p_sanitized_error_summary: null,
        p_completed_at: input.completedAt,
      });
      const result = Array.isArray(data) ? rowObject(data[0]) : rowObject(data);
      if (
        error ||
        !result ||
        result.run_status !== "completed" ||
        !Number.isInteger(result.inserted_row_count) ||
        !Number.isInteger(result.updated_row_count) ||
        !Number.isInteger(result.deactivated_row_count)
      ) {
        throw databaseFailure();
      }
      return {
        insertedRowCount: result.inserted_row_count as number,
        updatedRowCount: result.updated_row_count as number,
        deactivatedRowCount: result.deactivated_row_count as number,
      };
    },
  };
}
