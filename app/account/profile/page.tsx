import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { updateAccountProfile } from "@/app/account/profile/actions";
import { AvatarField } from "@/components/auth/avatar-field";
import { getDisplayNameChangeAvailability } from "@/lib/auth/profile";
import { createAuthServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "프로필 수정" };
export const dynamic = "force-dynamic";

function koreanDate(date: Date | null): string {
  if (!date) return "변경 가능 시점을 확인할 수 없습니다.";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(date);
}

export default async function AccountProfilePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createAuthServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("display_name, avatar_url, onboarding_completed, display_name_changed_at").eq("id", userId).maybeSingle();
  if (!profile?.onboarding_completed) redirect("/onboarding");
  const availability = getDisplayNameChangeAvailability(profile.display_name_changed_at);
  const { error } = await searchParams;

  return (
    <section className="site-shell py-12 sm:py-16">
      <form action={updateAccountProfile} noValidate className="surface-panel mx-auto max-w-xl p-6 sm:p-8">
        <p className="eyebrow">WEEKENDOG 계정</p>
        <h1 className="mt-2 text-3xl font-black">내 프로필 수정</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">커뮤니티와 헤더에 표시되는 사진과 이름을 관리합니다.</p>
        <AvatarField userId={userId} initialUrl={profile.avatar_url} />
        <label className="mt-6 block text-sm font-extrabold">
          커뮤니티 닉네임
          <input required name="displayName" defaultValue={profile.display_name} minLength={2} maxLength={24} disabled={!availability.allowed} className="mt-2 min-h-12 w-full rounded-xl border border-[var(--line)] bg-white px-4 disabled:bg-[#f2f4f2] disabled:text-[var(--muted)]" />
        </label>
        {!availability.allowed ? (
          <><input type="hidden" name="displayName" value={profile.display_name} /><p className="mt-2 text-sm leading-6 text-[var(--muted)]">닉네임은 30일에 한 번 변경할 수 있습니다. 다음 변경 가능일: {koreanDate(availability.nextAvailableAt)}</p></>
        ) : <p className="mt-2 text-sm leading-6 text-[var(--muted)]">닉네임을 변경하면 다음 변경은 30일 후 가능합니다.</p>}
        {error ? <p role="alert" className="mt-4 text-sm font-bold text-red-700">{error}</p> : null}
        <div className="mt-7 flex flex-wrap gap-3">
          <button type="submit" className="min-h-12 rounded-xl bg-[var(--brand)] px-5 text-sm font-extrabold text-white">프로필 저장</button>
          <Link href="/account" className="inline-flex min-h-12 items-center rounded-xl border border-[var(--line)] bg-white px-5 text-sm font-extrabold">취소</Link>
        </div>
      </form>
    </section>
  );
}
