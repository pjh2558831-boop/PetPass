import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260823134126_add_saved_pet_profiles.sql",
  ),
  "utf8",
).toLowerCase();
const privilegeMigration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260823135016_harden_auth_profile_privileges.sql",
  ),
  "utf8",
).toLowerCase();
const profileSelectMigration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260823135158_combine_profile_select_policies.sql",
  ),
  "utf8",
).toLowerCase();
const avatarBucketMigration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260823142200_harden_profile_avatar_bucket.sql",
  ),
  "utf8",
).toLowerCase();

describe("saved pet profile migration", () => {
  it("creates one owner-bound profile with database validation", () => {
    expect(migration).toContain("create table public.pet_profiles");
    expect(migration).toContain("user_id uuid primary key references auth.users (id) on delete cascade");
    expect(migration).toContain("char_length(name) between 1 and 30");
    expect(migration).toContain("species in ('dog', 'cat', 'other')");
    expect(migration).toContain("size in ('small', 'medium', 'large')");
  });

  it("enables RLS and restricts every operation to auth.uid ownership", () => {
    expect(migration).toContain("alter table public.pet_profiles enable row level security");
    expect(migration).toMatch(/for select to authenticated[\s\S]+?auth\.uid\(\)[\s\S]+?= user_id/u);
    expect(migration).toMatch(/for insert to authenticated[\s\S]+?auth\.uid\(\)[\s\S]+?= user_id/u);
    expect(migration).toMatch(/for update to authenticated[\s\S]+?using[\s\S]+?auth\.uid\(\)[\s\S]+?= user_id[\s\S]+?with check[\s\S]+?auth\.uid\(\)[\s\S]+?= user_id/u);
    expect(migration).not.toMatch(/to anon/u);
  });

  it("grants Data API access only to authenticated users", () => {
    expect(migration).toContain("grant select, insert, update on table public.pet_profiles to authenticated");
    expect(migration).not.toMatch(/grant [^;]+ on table public\.pet_profiles to anon/u);
  });

  it("removes default broad privileges and restores only required account operations", () => {
    for (const table of ["profiles", "pet_profiles"]) {
      expect(privilegeMigration).toContain(
        `revoke all on table public.${table} from anon, authenticated`,
      );
      expect(privilegeMigration).toContain(
        `grant select, insert, update on table public.${table} to authenticated`,
      );
    }
    expect(privilegeMigration).not.toMatch(/grant [^;]+ to anon/u);
  });

  it("combines owner and completed-community reads into one SELECT policy", () => {
    expect(profileSelectMigration).toContain(
      "drop policy \"profile owners can read their profile\" on public.profiles",
    );
    expect(profileSelectMigration).toContain(
      "drop policy \"authenticated users can read completed community profiles\" on public.profiles",
    );
    expect(profileSelectMigration).toMatch(
      /for select to authenticated[\s\S]+?auth\.uid\(\)[\s\S]+?= id[\s\S]+?or onboarding_completed = true/u,
    );
  });

  it("enforces avatar upload size and MIME restrictions in Storage", () => {
    expect(avatarBucketMigration).toContain("file_size_limit = 2097152");
    expect(avatarBucketMigration).toContain(
      "allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']",
    );
    expect(avatarBucketMigration).toContain("where id = 'profile-avatars'");
  });
});
