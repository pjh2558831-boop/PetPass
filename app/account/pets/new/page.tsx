import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createPet } from "@/app/account/pets/actions";
import { PetEditorForm } from "@/components/account/pet-editor-form";
import { createAuthServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "반려동물 등록" };
export const dynamic = "force-dynamic";

export default async function NewPetPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createAuthServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  const { error } = await searchParams;
  return (
    <section className="site-shell py-12 sm:py-16">
      <div className="mx-auto mb-6 max-w-2xl">
        <p className="eyebrow">나의 반려동물</p>
        <h1 className="mt-2 text-3xl font-black">새 반려동물 등록</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">여행 계획 입력과 별도로 마이페이지에 저장됩니다.</p>
      </div>
      <PetEditorForm action={createPet} error={error} submitLabel="반려동물 등록하기" />
    </section>
  );
}
