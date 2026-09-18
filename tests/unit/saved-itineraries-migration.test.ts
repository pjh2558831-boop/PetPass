import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase", "migrations", "20260918110647_add_saved_itineraries.sql"), "utf8").toLowerCase();

describe("saved itineraries migration", () => {
  it("keeps rows owner-scoped and enforces five saves under a transaction lock", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toMatch(/for select to authenticated[\s\S]+?auth\.uid\(\)[\s\S]+?= user_id/u);
    expect(migration).toMatch(/for insert to authenticated[\s\S]+?auth\.uid\(\)[\s\S]+?= user_id/u);
    expect(migration).toMatch(/for delete to authenticated[\s\S]+?auth\.uid\(\)[\s\S]+?= user_id/u);
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain(">= 5");
    expect(migration).toContain("saved_itineraries_limit");
  });
});
