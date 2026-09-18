import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(...segments: string[]) {
  return readFileSync(join(process.cwd(), ...segments), "utf8");
}

describe("account pet and profile management UI", () => {
  it("keeps pet registration separate from the planner and supports multiple editable cards", () => {
    const account = source("app", "account", "page.tsx");
    expect(account).toContain('href="/account/pets/new"');
    expect(account).toContain("반려동물을 등록하면 여행계획에서 바로 사용할 수 있어요.");
    expect(account).toContain("pets.map");
    expect(account).toContain("개별 정보 수정");
    expect(account).not.toContain('href="/planner/pet"');
  });

  it("provides dedicated add, edit, photo, and profile editing routes", () => {
    expect(source("app", "account", "pets", "new", "page.tsx")).toContain("새 반려동물 등록");
    expect(source("components", "account", "pet-editor-form.tsx")).toContain('name="image"');
    expect(source("app", "account", "pets", "[petId]", "edit", "page.tsx")).toContain("변경사항 저장");
    expect(source("app", "account", "profile", "page.tsx")).toContain("30일에 한 번");
  });

  it("makes pet editing controls visually explicit without changing their form values", () => {
    const editor = source("components", "account", "pet-editor-form.tsx");
    const deletion = source("components", "account", "delete-pet-form.tsx");

    expect(editor).toContain("사진 추가");
    expect(editor).toContain('name="image"');
    expect(editor).toContain('className="sr-only"');
    expect(editor).toContain("Dog");
    expect(editor).toContain("Cat");
    expect(editor).toContain("Package");
    expect(editor).toContain('aria-hidden="true"');
    expect(deletion).toContain(">삭제</button>");
    expect(deletion).not.toContain(">반려동물 삭제</button>");
  });

  it("uses open account layouts and keeps saved pets text-first without a large missing-photo panel", () => {
    const account = source("app", "account", "page.tsx");
    const profile = source("app", "account", "profile", "page.tsx");
    const editor = source("components", "account", "pet-editor-form.tsx");

    for (const routeSource of [account, profile, editor]) {
      expect(routeSource).not.toContain("surface-card");
      expect(routeSource).not.toContain("surface-panel");
    }
    expect(account).not.toContain("aspect-[16/10]");
    expect(account).not.toMatch(/등록된 사진 없음[\s\S]{0,180}size-full/u);
    expect(account).toContain("pets.map");
    expect(account).toContain("<h3");
    expect(account).toContain("개별 정보 수정");
  });

  it("gives desktop header navigation and the signed-in account control more room", () => {
    const header = source("components", "layout", "site-header.tsx");
    const account = source("components", "layout", "site-header-account.tsx");
    const styles = source("app", "weekendog-globals.css");

    expect(header).toContain('aria-label="주요 메뉴"');
    expect(header).toContain('className="site-header-navigation"');
    expect(styles).toMatch(/\.site-header-navigation\s*\{[\s\S]*?gap:\s*26px;/u);
    expect(header).toContain("Suspense");
    expect(account).toContain("min-h-12 max-w-56");
    expect(account).toContain("size-8 shrink-0");
  });

  it("keeps mobile account links uniquely keyed when destinations match", () => {
    const mobileNavigation = source("components", "layout", "mobile-navigation.tsx");

    expect(mobileNavigation).toContain("key={`${item.href}-${item.label}`}");
  });

  it("only announces account saves for status values emitted by real mutations", () => {
    const account = source("app", "account", "page.tsx");

    expect(account).toContain('status.pet === "saved"');
    expect(account).toContain('status.pet === "updated"');
    expect(account).toContain('status.pet === "deleted"');
    expect(account).toContain('status.profile === "updated"');
    expect(account).not.toContain("status.pet || status.profile");
  });

  it("rechecks ownership in every pet mutation", () => {
    const actions = source("app", "account", "pets", "actions.ts");
    expect(actions.match(/\.eq\("user_id", userId\)/gu)?.length).toBeGreaterThanOrEqual(4);
    expect(actions).toContain("assertPetImageSignature");
  });
});
