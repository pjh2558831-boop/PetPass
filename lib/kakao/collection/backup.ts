import { createHash } from "node:crypto";

export const KAKAO_CATALOG_BACKUP_FORMAT_VERSION =
  "kakao-busan-catalog-backup-v1";
export const PETPASS_SUPABASE_PROJECT_REF = "inucorualcworpzqxjiu";

export type KakaoCatalogBackupTableName =
  | "map_places"
  | "map_ingest_runs";

export type KakaoCatalogBackupTableArtifact = {
  file: `${KakaoCatalogBackupTableName}.ndjson`;
  rowCount: number;
  sha256: string;
  contents: string;
};

export type KakaoCatalogBackupArtifacts = {
  manifest: {
    formatVersion: typeof KAKAO_CATALOG_BACKUP_FORMAT_VERSION;
    projectRef: typeof PETPASS_SUPABASE_PROJECT_REF;
    createdAt: string;
    tables: Record<
      KakaoCatalogBackupTableName,
      Omit<KakaoCatalogBackupTableArtifact, "contents">
    >;
  };
  tables: Record<KakaoCatalogBackupTableName, KakaoCatalogBackupTableArtifact>;
};

function normalizedJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizedJsonValue);
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, child]) => [key, normalizedJsonValue(child)]),
  );
}

export function normalizedNdjson(rows: readonly unknown[]): string {
  if (rows.length === 0) return "";
  return `${rows
    .map((row) => JSON.stringify(normalizedJsonValue(row)))
    .join("\n")}\n`;
}

export function sha256Hex(contents: string): string {
  return createHash("sha256").update(contents, "utf8").digest("hex");
}

function tableArtifact(
  tableName: KakaoCatalogBackupTableName,
  rows: readonly unknown[],
): KakaoCatalogBackupTableArtifact {
  const contents = normalizedNdjson(rows);
  return {
    file: `${tableName}.ndjson`,
    rowCount: rows.length,
    sha256: sha256Hex(contents),
    contents,
  };
}

export function createKakaoCatalogBackupArtifacts(input: {
  createdAt: string;
  mapPlaces: readonly unknown[];
  mapIngestRuns: readonly unknown[];
}): KakaoCatalogBackupArtifacts {
  const createdAt = new Date(input.createdAt);
  if (!Number.isFinite(createdAt.getTime())) {
    throw new Error("invalid_backup_timestamp");
  }

  const tables = {
    map_places: tableArtifact("map_places", input.mapPlaces),
    map_ingest_runs: tableArtifact("map_ingest_runs", input.mapIngestRuns),
  } satisfies Record<KakaoCatalogBackupTableName, KakaoCatalogBackupTableArtifact>;

  return {
    manifest: {
      formatVersion: KAKAO_CATALOG_BACKUP_FORMAT_VERSION,
      projectRef: PETPASS_SUPABASE_PROJECT_REF,
      createdAt: createdAt.toISOString(),
      tables: {
        map_places: {
          file: tables.map_places.file,
          rowCount: tables.map_places.rowCount,
          sha256: tables.map_places.sha256,
        },
        map_ingest_runs: {
          file: tables.map_ingest_runs.file,
          rowCount: tables.map_ingest_runs.rowCount,
          sha256: tables.map_ingest_runs.sha256,
        },
      },
    },
    tables,
  };
}

export function assertPetPassSupabaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalid_supabase_project");
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== `${PETPASS_SUPABASE_PROJECT_REF}.supabase.co` ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("invalid_supabase_project");
  }

  return url.origin;
}
