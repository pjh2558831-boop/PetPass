import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/account/actions";
import { savedPetProfileFromRow } from "@/lib/auth/pet-profile";
import { createAuthServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "마이페이지",
};
export const dynamic = "force-dynamic";

const speciesLabels = { DOG: "강아지", CAT: "고양이", OTHER: "기타 반려동물" } as const;
const sizeLabels = { SMALL: "소형", MEDIUM: "중형", LARGE: "대형" } as const;

export default async function AccountPage() {
  const supabase = await createAuthServerClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const [{ data: profile }, { data: petRow, error: petError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, avatar_url, onboarding_completed")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("pet_profiles")
      .select("user_id, name, species, size, has_carrier, has_leash, has_muzzle, accepts_outdoor_only, created_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (!profile?.onboarding_completed) redirect("/onboarding");
  if (petError) throw new Error("저장된 반려동물 정보를 불러오지 못했습니다.");
  const pet = petRow ? savedPetProfileFromRow(petRow) : null;

  return (
    <section className="site-shell py-12 sm:py-16">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="surface-panel p-6 sm:p-8">
          <p className="eyebrow">WEEKENDOG 계정</p>
          <div className="mt-4 flex items-center gap-4">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--brand-soft)] font-black text-[var(--brand)]">
              {profile.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt="커뮤니티 프로필 이미지"
                  width={64}
                  height={64}
                  unoptimized
                  className="size-full object-cover"
                />
              ) : (
                "WD"
              )}
            </div>
            <div>
              <h1 className="text-2xl font-black">{profile.display_name}</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                커뮤니티에는 이 이름과 이미지만 표시됩니다.
              </p>
            </div>
          </div>
        </header>

        <section className="surface-panel p-6 sm:p-8" aria-labelledby="saved-pet-heading">
          <p className="eyebrow">추천 기본값</p>
          <h2 id="saved-pet-heading" className="mt-2 text-xl font-black">
            저장된 반려동물 정보
          </h2>
          {pet ? (
            <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--line)] bg-white p-5">
              <p className="text-lg font-black">{pet.name}</p>
              <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
                {speciesLabels[pet.species]} · {sizeLabels[pet.size]}
              </p>
              <p className="mt-3 text-sm leading-6 text-[#52665b]">
                다음 여행 정보 입력 화면에서 이 값을 자동으로 불러오며, 저장 후 추천 조건에 반영합니다.
              </p>
            </div>
          ) : (
            <p className="mt-4 rounded-[var(--radius-card)] bg-[var(--surface-sage)] p-4 text-sm leading-6 text-[var(--muted)]">
              아직 저장된 반려동물 정보가 없습니다.
            </p>
          )}
          <Link
            href="/planner/pet"
            className="mt-5 inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-[var(--brand)] px-4 text-sm font-extrabold text-white"
          >
            {pet ? "반려동물 정보 수정하기" : "반려동물 정보 입력하기"}
          </Link>
        </section>

        <form action={signOut} className="flex justify-end">
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--line)] bg-white px-4 text-sm font-extrabold text-[#52645b]"
          >
            로그아웃
          </button>
        </form>
      </div>
    </section>
  );
}
