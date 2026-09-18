import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Plus, UserRound, PawPrint, Pencil, LogOut, Dog, Cat } from "lucide-react";
import { redirect } from "next/navigation";
import { signOut } from "@/app/account/actions";
import { PET_IMAGE_BUCKET } from "@/lib/auth/pet-image";
import {
  isMissingMultiPetSchemaError,
  savedPetProfileFromLegacyRow,
  savedPetProfileFromRow,
} from "@/lib/auth/pet-profile";
import { createAuthServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "마이페이지" };
export const dynamic = "force-dynamic";

const speciesLabels = { DOG: "강아지", CAT: "고양이", OTHER: "기타 반려동물" } as const;
const sizeLabels = { SMALL: "소형", MEDIUM: "중형", LARGE: "대형" } as const;
const petFallbackIcons = { DOG: Dog, CAT: Cat, OTHER: PawPrint } as const;

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
  let isLegacyPetSchema = false;
  let pets: Array<{ pet: ReturnType<typeof savedPetProfileFromRow>; imageUrl: string | null }>;

  if (petError && isMissingMultiPetSchemaError(petError)) {
    isLegacyPetSchema = true;
    const { data: legacyRows, error: legacyError } = await supabase
      .from("pet_profiles")
      .select("user_id, name, species, size, has_carrier, has_leash, has_muzzle, accepts_outdoor_only, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (legacyError) throw new Error("저장된 반려동물 정보를 불러오지 못했습니다.");
    pets = (legacyRows ?? []).map((row) => ({
      pet: savedPetProfileFromLegacyRow(row),
      imageUrl: null,
    }));
  } else {
    if (petError) throw new Error("저장된 반려동물 정보를 불러오지 못했습니다.");
    pets = await Promise.all((petRows ?? []).map(async (row) => {
      const pet = savedPetProfileFromRow(row);
      const imageUrl = row.image_path ? (await supabase.storage.from(PET_IMAGE_BUCKET).createSignedUrl(row.image_path, 3600)).data?.signedUrl ?? null : null;
      return { pet, imageUrl };
    }));
  }
  const status = await searchParams;
  const statusMessage =
    status.pet === "saved"
      ? "반려동물 정보를 저장했습니다."
      : status.pet === "updated"
        ? "반려동물 정보를 수정했습니다."
        : status.pet === "deleted"
          ? "반려동물 정보를 삭제했습니다."
          : status.profile === "updated"
            ? "프로필 정보를 수정했습니다."
            : null;

  return (
    <section className="site-shell account-redesign">
      <div className="account-document mx-auto">
        <div className="account-page-heading"><h1>마이페이지</h1><p>나와 반려동물의 특별한 여행을 더 편리하게 관리해보세요.</p></div>
        <header className="account-document__header">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              
              <div className="mt-4 flex items-center gap-4">
                <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--brand-soft)] font-black text-[var(--brand)]">
                  {profile.avatar_url ? <Image src={profile.avatar_url} alt="커뮤니티 프로필 이미지" width={64} height={64} unoptimized className="size-full object-cover" /> : <UserRound size={32} strokeWidth={1.8} aria-hidden="true" />}
                </div>
                <div className="min-w-0">
                  <h2 className="break-words text-2xl font-black [overflow-wrap:anywhere]">{profile.display_name}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">커뮤니티와 헤더에 이 이름과 이미지가 표시됩니다.</p>
                </div>
              </div>
            </div>
            {!isLegacyPetSchema ? <Link href="/account/profile" className="inline-flex min-h-11 items-center rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-extrabold"><Pencil size={16} aria-hidden="true" />내 프로필 수정</Link> : null}
          </div>
        </header>

        <section className="account-document__section" aria-labelledby="saved-pet-heading">
          <div className="account-pet-section-heading flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="saved-pet-heading" className="text-2xl font-black">나의 반려동물</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">반려동물을 등록하면 여행계획에서 바로 사용할 수 있어요.</p>
            </div>
            <div className="account-pet-section-actions">
              {!isLegacyPetSchema && pets.length > 0 ? <Link href="/account/pets/new" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-extrabold text-white"><Plus size={17} aria-hidden="true" />반려동물 정보 추가하기</Link> : null}
            </div>
          </div>

          {isLegacyPetSchema ? <p role="note" className="account-document__notice mt-5">이전에 저장한 반려동물 정보는 현재 읽기 전용으로 표시됩니다.</p> : null}
          {statusMessage ? <p role="status" className="account-document__status mt-5">{statusMessage}</p> : null}
          {pets.length > 0 ? (
            <div className="account-pet-list mt-6">
              {pets.map(({ pet, imageUrl }) => (
                <article key={pet.id} className="account-pet-row">
                  <div className="account-pet-avatar">
                    {imageUrl ? <Image src={imageUrl} alt={`${pet.name} 사진`} width={64} height={64} unoptimized className="size-full object-cover" /> : (() => { const Icon = petFallbackIcons[pet.species]; return <Icon size={30} aria-hidden="true" />; })()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-xl font-black [overflow-wrap:anywhere]">{pet.name}</h3>
                    <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{speciesLabels[pet.species]} · {sizeLabels[pet.size]}</p>
                  </div>
                  {!isLegacyPetSchema ? <Link href={`/account/pets/${pet.id}/edit`} aria-label={`${pet.name} 정보 수정`} className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-[var(--line)] px-4 text-sm font-extrabold">개별 정보 수정</Link> : <p className="shrink-0 text-sm font-bold text-[var(--muted)]">읽기 전용</p>}
                </article>
              ))}
            </div>
          ) : (
            <div className="account-pet-empty"><span className="account-pet-empty__icon"><PawPrint size={38} aria-hidden="true" /></span>
              <p className="font-extrabold">아직 등록한 반려동물이 없습니다.</p>
              <p className="mt-1 text-sm text-[var(--muted)]">우리 아이의 사진과 기본 정보를 등록하고 여행을 준비해 보세요.</p>
              {!isLegacyPetSchema ? <Link href="/account/pets/new" className="account-add-pet"><Plus size={18} aria-hidden="true" />반려동물 정보 추가하기</Link> : null}
            </div>
          )}
        </section>

        <form action={signOut} noValidate className="account-document__footer flex justify-end">
          <div className="account-management-copy"><h2>계정 관리</h2><p>더 안전하고 편리한 서비스를 위해 계정을 관리할 수 있습니다.</p></div>
          <button type="submit" className="inline-flex min-h-11 items-center rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-extrabold text-[#52645b]"><LogOut size={17} aria-hidden="true" />로그아웃</button>
        </form>
      </div>
    </section>
  );
}
