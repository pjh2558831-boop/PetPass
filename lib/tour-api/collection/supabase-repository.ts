import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  JEJU_KTO_DISTRICTS,
  JEJU_KTO_PROVIDER,
  JEJU_KTO_REGION_ID,
  JEJU_KTO_REGISTRY_VERSION,
  type JejuKtoDistrictCode,
  type KtoCatalogCollectionRepository,
  type KtoCatalogDistrictAudit,
  type KtoCatalogDistrictCollection,
  type KtoCatalogMapPlace,
  type KtoCatalogRunId,
  type KtoCatalogRunScopeInput,
} from "@/lib/tour-api/collection/contracts";
import { JejuKtoCollectionError } from "@/lib/tour-api/collection/errors";

const PETPASS_SUPABASE_PROJECT_REF = "inucorualcworpzqxjiu";

const mapPlaceSchema = z.object({
  region_id: z.literal(JEJU_KTO_REGION_ID),
  provider: z.literal(JEJU_KTO_PROVIDER),
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
  district_code: z.enum(["110", "130"]),
  district_name: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
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
  districtCode: z.enum(["110", "130"]),
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
    throw new JejuKtoCollectionError(
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
    throw new JejuKtoCollectionError("CONFIGURATION", "Invalid Supabase project URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== `${PETPASS_SUPABASE_PROJECT_REF}.supabase.co`
  ) {
    throw new JejuKtoCollectionError("CONFIGURATION", "Unexpected Supabase project URL.");
  }
  return url.origin;
}

function safeRunId(value: KtoCatalogRunId): string {
  const normalized = String(value).trim();
  if (!/^[1-9][0-9]*$/u.test(normalized)) {
    throw new JejuKtoCollectionError("CONFIGURATION", "Invalid KTO run identifier.");
  }
  return normalized;
}

function assertScope(input: KtoCatalogRunScopeInput): void {
  if (
    input.regionId !== JEJU_KTO_REGION_ID ||
    input.provider !== JEJU_KTO_PROVIDER ||
    input.districtCodes.length !== JEJU_KTO_DISTRICTS.length ||
    JEJU_KTO_DISTRICTS.some(({ code }) => !input.districtCodes.includes(code))
  ) {
    throw new JejuKtoCollectionError("CONFIGURATION", "Invalid Jeju KTO run scope.");
  }
}

function rowObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

function databaseFailure(): JejuKtoCollectionError {
  return new JejuKtoCollectionError(
    "DATABASE_FAILURE",
    "The Jeju KTO catalog repository rejected the operation.",
  );
}

export function createSupabaseKtoCatalogRepository(): KtoCatalogCollectionRepository {
  const supabase = createClient(
    petPassSupabaseUrl(),
    requiredEnvironmentValue("SUPABASE_SECRET_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: { headers: { "X-Client-Info": "petpass-tour-jeju-collector-v1" } },
    },
  );

  async function loadCompletedDistricts(runId: KtoCatalogRunId) {
    const id = safeRunId(runId);
    const { data: checkpointData, error: checkpointError } = await supabase
      .from("map_tour_ingest_checkpoints")
      .select("district_code,district_name,audit")
      .eq("region_id", JEJU_KTO_REGION_ID)
      .eq("provider", JEJU_KTO_PROVIDER)
      .eq("collection_run_id", id);
    if (checkpointError || !Array.isArray(checkpointData)) throw databaseFailure();

    const completed: KtoCatalogDistrictCollection[] = [];
    for (const checkpointValue of checkpointData) {
      const checkpoint = rowObject(checkpointValue);
      const audit = districtAuditSchema.safeParse(checkpoint?.audit);
      if (
        !checkpoint ||
        (checkpoint.district_code !== "110" && checkpoint.district_code !== "130") ||
        !audit.success ||
        audit.data.districtCode !== checkpoint.district_code ||
        audit.data.districtName !== checkpoint.district_name
      ) {
        throw databaseFailure();
      }
      const districtCode = checkpoint.district_code;
      const { data: stageData, error: stageError } = await supabase
        .from("map_tour_ingest_stage_places")
        .select(
          "region_id,provider,provider_place_id,name,category_group,category_code,content_type_id,road_address,lot_address,district_code,district_name,latitude,longitude,phone,image_url,source_url,provider_visibility,pet_evidence_status,pet_evidence,pet_notes,fetched_at",
        )
        .eq("region_id", JEJU_KTO_REGION_ID)
        .eq("provider", JEJU_KTO_PROVIDER)
        .eq("collection_run_id", id)
        .eq("district_code", districtCode);
      if (stageError || !Array.isArray(stageData)) throw databaseFailure();
      const parsedRows = z.array(mapPlaceSchema).safeParse(stageData);
      if (!parsedRows.success || parsedRows.data.length !== audit.data.acceptedCount) {
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
      assertScope(input);
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
        result?.planned_district_count !== 2
      ) {
        throw databaseFailure();
      }
      return {
        runId,
        completedDistrictCodes: new Set<JejuKtoDistrictCode>(),
        completedDistricts: [],
      };
    },

    async resumeRun(input) {
      assertScope(input);
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
        run.registry_version !== JEJU_KTO_REGISTRY_VERSION ||
        run.planned_query_count !== 2 ||
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
        completedDistrictCodes: new Set(completedDistricts.map(({ districtCode }) => districtCode)),
        completedDistricts,
      };
    },

    async checkpointDistrict(input) {
      assertScope(input);
      if (
        input.audit.districtCode !== input.districtCode ||
        input.rows.some(
          (row) =>
            row.region_id !== input.regionId ||
            row.provider !== input.provider ||
            row.district_code !== input.districtCode,
        )
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
        input.regionId !== JEJU_KTO_REGION_ID ||
        input.provider !== JEJU_KTO_PROVIDER
      ) {
        throw new JejuKtoCollectionError("CONFIGURATION", "Invalid Jeju KTO failure scope.");
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
      assertScope(input);
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
