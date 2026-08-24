import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260824123000_add_multi_pet_profiles_and_profile_editing.sql"),
  "utf8",
).toLowerCase();

describe("multi-pet account migration", () => {
  it("preserves existing pets while replacing the owner primary key with a pet id", () => {
    expect(migration).toContain("add column id uuid");
    expect(migration).toContain("update public.pet_profiles");
    expect(migration).toContain("drop constraint pet_profiles_pkey");
    expect(migration).toContain("primary key (id)");
    expect(migration).toContain("create index pet_profiles_user_id_idx");
  });

  it("stores only owner-scoped private pet image paths", () => {
    expect(migration).toContain("add column image_path text");
    expect(migration).toContain("split_part(image_path, '/', 1) = user_id::text");
    expect(migration).toMatch(/values\s*\(\s*'pet-images',\s*'pet-images',\s*false/u);
    expect(migration).toMatch(/file_size_limit,\s*allowed_mime_types[\s\S]+?2097152,\s*array\['image\/png', 'image\/jpeg', 'image\/webp'\]/u);
    expect(migration).toMatch(/bucket_id = 'pet-images'[\s\S]+?storage\.foldername\(name\)\)\[1\][\s\S]+?auth\.uid/u);
  });

  it("allows owners to manage multiple pets including deletion", () => {
    for (const operation of ["select", "insert", "update", "delete"]) {
      expect(migration).toMatch(
        new RegExp(`for ${operation} to authenticated[\\s\\S]+?auth\\.uid\\(\\)[\\s\\S]+?= user_id`, "u"),
      );
    }
    expect(migration).toContain("grant select, insert, delete on table public.pet_profiles to authenticated");
    expect(migration).toMatch(/grant update \([\s\S]+?image_path[\s\S]+?\) on table public\.pet_profiles to authenticated/u);
    expect(migration).not.toMatch(/grant update \([\s\S]+?\bid\b[\s\S]+?\) on table public\.pet_profiles/u);
  });

  it("enforces the 30-day display-name cooldown in the database", () => {
    expect(migration).toContain("add column display_name_changed_at timestamptz");
    expect(migration).toContain("interval '30 days'");
    expect(migration).toContain("display_name_change_cooldown");
    expect(migration).toContain("before update of display_name on public.profiles");
    expect(migration).toContain("grant update (display_name, avatar_url, onboarding_completed) on table public.profiles to authenticated");
  });
});
