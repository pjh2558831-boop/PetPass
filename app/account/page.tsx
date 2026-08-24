import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PawPrint, Plus, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { signOut } from "@/app/account/actions";
import { PET_IMAGE_BUCKET } from "@/lib/auth/pet-image";
import { savedPetProfileFromRow } from "@/lib/auth/pet-profile";
import { createAuthServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "마이페이지" };
export const dynamic = "force-dynamic";

const speciesLabels = { DOG: "강아지", CAT: "고양이", OTHER: "기타 반려동물" } as const;
const sizeLabels = { SMALL: "소형", MEDIUM: "중형", LARGE: "대형" } as const;

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ pet?: string; profile?: string }> }) {
  const supabase = await createAuthServerClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const [{ data: profile }, { data: petRows, error: petError }] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url, onboarding_completed").eq("id", userId).maybeSingle(),
    supabase.from("pet_profiles").select("id, user_id, name, species, size, has_carrier, has_leash, has_muzzle, accepts_outdoor_only, image_path, created_at, updated_at").eq("user_id", userId).order("created_at", { ascending: true }),
  ]);
  if (!profile?.onboarding_completed) redirect("/onboarding");
  if (petError) throw new Error("저장된 반려동물 정보를 불러오지 못했습니다.");

  const pets = await Promise.all((petRows ?? []).map(async (row) => {
    const pet = savedPetProfileFromRow(row);
    const imageUrl = row.image_path ? (await supabase.storage.from(PET_IMAGE_BUCKET).createSignedUrl(row.image_path, 3600)).data?.signedUrl ?? null : null;
    return { pet, imageUrl };
  }));
  const status = await searchParams;

  return (
    <section className="site-shell py-12 sm:py-16">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="surface-panel p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow">WEEKENDOG 계정</p>
              <div className="mt-4 flex items-center gap-4">
                <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--brand-soft)] font-black text-[var(--brand)]">
                  {profile.avatar_url ? <Image src={profile.avatar_url} alt="커뮤니티 프로필 이미지" width={64} height={64} unoptimized className="size-full object-cover" /> : <UserRound size={32} strokeWidth={1.8} aria-hidden="true" />}
                </div>
                <div>
                  <h1 className="text-2xl font-black">{profile.display_name}</h1>
                  <p className="mt-1 text-sm text-[var(--muted)]">커뮤니티와 헤더에 이 이름과 이미지가 표시됩니다.</p>
                </div>
              </div>
            </div>
            <Link href="/account/profile" className="inline-flex min-h-11 items-center rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-extrabold">내 프로필 수정</Link>
          </div>
        </header>

        <section className="surface-panel p-6 sm:p-8" aria-labelledby="saved-pet-heading">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">나의 반려동물</p>
              <h2 id="saved-pet-heading" className="mt-2 text-2xl font-black">등록한 반려동물</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">여행 계획 입력과 별도로 마이페이지에서 여러 마리를 관리할 수 있습니다.</p>
            </div>
            <Link href="/account/pets/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-extrabold text-white"><Plus size={17} aria-hidden="true" />반려동물 정보 추가하기</Link>
          </div>

          {status.pet || status.profile ? <p role="status" className="mt-5 rounded-xl bg-[var(--brand-soft)] p-3 text-sm font-bold text-[var(--brand)]">변경사항을 저장했습니다.</p> : null}
          {pets.length > 0 ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {pets.map(({ pet, imageUrl }) => (
                <article key={pet.id} className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-white">
                  <div className="aspect-[16/10] bg-[var(--surface-sage)]">
                    {imageUrl ? <Image src={imageUrl} alt={`${pet.name} 사진`} width={640} height={400} unoptimized className="size-full object-cover" /> : <div className="grid size-full place-items-center text-[var(--brand)]"><PawPrint size={42} strokeWidth={1.6} aria-hidden="true" /><span className="sr-only">등록된 사진 없음</span></div>}
                  </div>
                  <div className="p-5">
                    <h3 className="text-xl font-black">{pet.name}</h3>
                    <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{speciesLabels[pet.species]} · {sizeLabels[pet.size]}</p>
                    <Link href={`/account/pets/${pet.id}/edit`} className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-[var(--line)] px-4 text-sm font-extrabold">개별 정보 수정</Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-[var(--radius-card)] bg-[var(--surface-sage)] p-6 text-center">
              <PawPrint className="mx-auto text-[var(--brand)]" size={36} aria-hidden="true" />
              <p className="mt-3 font-extrabold">아직 등록한 반려동물이 없습니다.</p>
              <p className="mt-1 text-sm text-[var(--muted)]">사진과 기본 정보를 등록해 보세요.</p>
            </div>
          )}
        </section>

        <form action={signOut} className="flex justify-end">
          <button type="submit" className="inline-flex min-h-11 items-center rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-extrabold text-[#52645b]">로그아웃</button>
        </form>
      </div>
    </section>
  );
}
