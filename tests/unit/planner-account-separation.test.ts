import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const plannerSource = readFileSync(join(process.cwd(), "components", "planner", "unified-planner-form.tsx"), "utf8");
const plannerPageSource = readFileSync(join(process.cwd(), "app", "planner", "pet", "page.tsx"), "utf8");

describe("planner and account pet separation", () => {
  it("does not persist planner input to the account or browser profile store", () => {
    expect(plannerSource).not.toContain("/api/account/pet-profile");
    expect(plannerSource).not.toContain("savePetProfile(");
  });

  it("does not automatically hydrate the planner with an account pet", () => {
    expect(plannerPageSource).not.toContain("initialPetProfile");
    expect(plannerPageSource).not.toContain("savedPetProfileFromRow");
  });
});
