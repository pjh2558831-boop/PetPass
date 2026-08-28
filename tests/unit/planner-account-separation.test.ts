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

  it("offers saved account pets as an explicit planner choice", () => {
    expect(plannerPageSource).toContain("initialSavedPets");
    expect(plannerPageSource).toContain("savedPetProfileFromRow");
    expect(plannerSource).toContain("저장된 반려동물 불러오기");
    expect(plannerSource).toContain("applySavedPet");
  });
});
