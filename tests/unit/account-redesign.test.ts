import { expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/app/account/actions", () => ({ signOut: async () => {} }));
vi.mock("@/lib/supabase/server", () => ({ createAuthServerClient: async () => ({
  auth: { getClaims: async () => ({ data: { claims: { sub: "qa-account" } } }) },
  from: () => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => ({ data: { display_name: "여행자", avatar_url: null, onboarding_completed: true } }),
    order: async () => ({ data: [], error: null }),
  }) }) }),
}) }));
import AccountPage from "@/app/account/page";
test("renders the account empty state with profile and pet actions", async () => {
  const html = renderToStaticMarkup(await AccountPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("아직 등록한 반려동물이 없습니다.");
  expect(html).toContain('/account/pets/new');
  expect(html).toContain('/account/profile');
});
