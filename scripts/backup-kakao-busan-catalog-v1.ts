import "server-only";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  assertPetPassSupabaseUrl,
  createKakaoCatalogBackupArtifacts,
  sha256Hex,
  type KakaoCatalogBackupTableName,
} from "@/lib/kakao/collection/backup";

const BACKUP_ROOT = resolve(
  process.cwd(),
  "verification-evidence",
  "kakao-busan-catalog-v1",
  "backup",
);
const PAGE_SIZE = 500;

class BackupConfigurationError extends Error {}
class BackupReadError extends Error {}

function loadLocalEnvironmentIfNeeded(requiredNames: readonly string[]): void {
  if (requiredNames.every((name) => process.env[name]?.trim())) return;
  const environmentPath = resolve(process.cwd(), ".env.local");
  if (existsSync(environmentPath)) process.loadEnvFile(environmentPath);
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new BackupConfigurationError();
  return value;
}

function backupDirectoryName(createdAt: string): string {
  return createdAt.replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
}

export async function runKakaoCatalogBackup(): Promise<void> {
  const requiredNames = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"];
  loadLocalEnvironmentIfNeeded(requiredNames);

  const supabaseUrl = assertPetPassSupabaseUrl(
    requiredEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL"),
  );
  const secretKey = requiredEnvironmentValue("SUPABASE_SECRET_KEY");
  const client = createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { headers: { "X-Client-Info": "petpass-catalog-backup-v1" } },
  });

  async function readWholeTable(
    tableName: KakaoCatalogBackupTableName,
  ): Promise<unknown[]> {
    const rows: unknown[] = [];
    let expectedCount: number | null = null;

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error, count } = await client
        .from(tableName)
        .select("*", { count: "exact" })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error || !Array.isArray(data) || typeof count !== "number") {
        throw new BackupReadError(`${tableName}:${error?.code ?? "invalid_response"}`);
      }
      if (expectedCount === null) expectedCount = count;
      if (count !== expectedCount) throw new BackupReadError();

      rows.push(...data);
      if (rows.length >= expectedCount) break;
      if (data.length === 0) throw new BackupReadError();
    }

    if (rows.length !== expectedCount) throw new BackupReadError();
    return rows;
  }

  const createdAt = new Date().toISOString();
  const [mapPlaces, mapIngestRuns] = await Promise.all([
    readWholeTable("map_places"),
    readWholeTable("map_ingest_runs"),
  ]);
  const artifacts = createKakaoCatalogBackupArtifacts({
    createdAt,
    mapPlaces,
    mapIngestRuns,
  });
  const outputDirectory = resolve(
    BACKUP_ROOT,
    backupDirectoryName(artifacts.manifest.createdAt),
  );

  mkdirSync(outputDirectory, { recursive: true });
  for (const tableName of ["map_places", "map_ingest_runs"] as const) {
    const artifact = artifacts.tables[tableName];
    const outputPath = resolve(outputDirectory, artifact.file);
    writeFileSync(outputPath, artifact.contents, {
      encoding: "utf8",
      flag: "wx",
    });
    const writtenContents = readFileSync(outputPath, "utf8");
    const writtenRowCount =
      writtenContents === "" ? 0 : writtenContents.split("\n").length - 1;
    if (
      writtenRowCount !== artifact.rowCount ||
      sha256Hex(writtenContents) !== artifact.sha256
    ) {
      throw new BackupReadError();
    }
  }
  writeFileSync(
    resolve(outputDirectory, "manifest.json"),
    `${JSON.stringify(artifacts.manifest, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );

  console.log(
    JSON.stringify({
      ok: true,
      backupDirectory: outputDirectory,
      tables: artifacts.manifest.tables,
    }),
  );
}

async function main(): Promise<void> {
  try {
    await runKakaoCatalogBackup();
  } catch (error) {
    const code =
      error instanceof BackupConfigurationError
        ? "backup_configuration_error"
        : error instanceof BackupReadError
          ? "backup_read_error"
          : error instanceof Error && error.message === "invalid_supabase_project"
            ? "backup_project_mismatch"
            : "backup_failed";
    console.error(JSON.stringify({
      ok: false,
      code,
      ...(error instanceof BackupReadError ? { reason: error.message } : {}),
    }));
    process.exitCode = 1;
  }
}

const directEntry = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (directEntry === import.meta.url) void main();
