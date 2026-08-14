import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/u.test(entry.name) ? [path] : [];
  });
}

function contents(paths: readonly string[]): string {
  return paths.map((path) => readFileSync(path, "utf8")).join("\n");
}

describe("Kakao catalog security boundaries", () => {
  it("never defines browser-visible REST or service-role key names", () => {
    const publicSources = contents(
      ["app", "components", "lib", "types"].flatMap((root) =>
        sourceFiles(join(process.cwd(), root)),
      ),
    );
    const forbiddenNames = [
      ["NEXT", "PUBLIC", "KAKAO", "REST", "API", "KEY"].join("_"),
      ["NEXT", "PUBLIC", "SUPABASE", "SERVICE", "ROLE", "KEY"].join("_"),
      ["NEXT", "PUBLIC", "SUPABASE", "SECRET", "KEY"].join("_"),
    ];

    for (const name of forbiddenNames) expect(publicSources).not.toContain(name);
  });

  it("keeps the candidate catalog outside recommendation and itinerary modules", () => {
    const recommendationSources = contents(
      ["lib/recommendation", "lib/itinerary"].flatMap((root) =>
        sourceFiles(join(process.cwd(), root)),
      ),
    );

    expect(recommendationSources).not.toMatch(
      /pet_travel_candidate|veterinary|pet_shop|kakao\/collection|place-candidate/u,
    );
  });
});
