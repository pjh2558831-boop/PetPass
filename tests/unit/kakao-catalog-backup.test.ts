import {
  assertPetPassSupabaseUrl,
  createKakaoCatalogBackupArtifacts,
  normalizedNdjson,
  sha256Hex,
} from "@/lib/kakao/collection/backup";
import { describe, expect, it } from "vitest";

describe("Kakao catalog pre-migration backup", () => {
  it("normalizes nested object keys without changing row order", () => {
    expect(
      normalizedNdjson([
        { z: 1, a: { y: true, b: null }, list: [{ d: 4, c: 3 }] },
        { id: 2 },
      ]),
    ).toBe(
      '{"a":{"b":null,"y":true},"list":[{"c":3,"d":4}],"z":1}\n' +
        '{"id":2}\n',
    );
  });

  it("builds count and SHA-256 manifest entries from exact bytes", () => {
    const artifacts = createKakaoCatalogBackupArtifacts({
      createdAt: "2026-08-15T00:00:00.000Z",
      mapPlaces: [{ id: 1, provider: "kakao" }],
      mapIngestRuns: [{ id: 7, status: "completed" }],
    });

    expect(artifacts.manifest.projectRef).toBe("inucorualcworpzqxjiu");
    expect(artifacts.manifest.tables.map_places.rowCount).toBe(1);
    expect(artifacts.manifest.tables.map_ingest_runs.rowCount).toBe(1);
    expect(artifacts.manifest.tables.map_places.sha256).toBe(
      sha256Hex(artifacts.tables.map_places.contents),
    );
    expect(artifacts.manifest.tables.map_ingest_runs.sha256).toBe(
      sha256Hex(artifacts.tables.map_ingest_runs.contents),
    );
    expect(JSON.stringify(artifacts.manifest)).not.toContain("SUPABASE_SECRET_KEY");
  });

  it("accepts only the exact existing PetPass Supabase origin", () => {
    expect(
      assertPetPassSupabaseUrl(
        "https://inucorualcworpzqxjiu.supabase.co/",
      ),
    ).toBe("https://inucorualcworpzqxjiu.supabase.co");

    for (const invalid of [
      "https://other.supabase.co",
      "http://inucorualcworpzqxjiu.supabase.co",
      "https://inucorualcworpzqxjiu.supabase.co/rest/v1",
      "https://inucorualcworpzqxjiu.supabase.co?key=value",
    ]) {
      expect(() => assertPetPassSupabaseUrl(invalid)).toThrow(
        "invalid_supabase_project",
      );
    }
  });
});
