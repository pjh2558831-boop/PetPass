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
    expect(account).toContain("여행 계획 입력과 별도로");
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

  it("gives desktop header navigation and the signed-in account control more room", () => {
    const header = source("components", "layout", "site-header.tsx");
    const account = source("components", "layout", "site-header-account.tsx");

    expect(header).toContain('aria-label="주요 메뉴"');
    expect(header).toContain("gap-2 lg:flex xl:gap-3");
    expect(header).toContain("Suspense");
    expect(account).toContain("min-h-12 max-w-56");
    expect(account).toContain("size-8 shrink-0");
  });

  it("keeps mobile account links uniquely keyed when destinations match", () => {
    const mobileNavigation = source("components", "layout", "mobile-navigation.tsx");

    expect(mobileNavigation).toContain("key={`${item.href}-${item.label}`}");
  });

  it("rechecks ownership in every pet mutation", () => {
    const actions = source("app", "account", "pets", "actions.ts");
    expect(actions.match(/\.eq\("user_id", userId\)/gu)?.length).toBeGreaterThanOrEqual(4);
    expect(actions).toContain("assertPetImageSignature");
  });
});
