import { redirect } from "next/navigation";
import { completeOnboarding } from "@/app/onboarding/actions";
import { AvatarField } from "@/components/auth/avatar-field";
import { socialProfileDefaults } from "@/lib/auth/profile";
import { createAuthServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createAuthServerClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");
  const { data: existing } = await supabase.from("profiles").select("onboarding_completed").eq("id", userId).maybeSingle();
  if (existing?.onboarding_completed) redirect("/");
  const { data: userData } = await supabase.auth.getUser();
  const defaults = socialProfileDefaults(userData.user?.user_metadata ?? {});
  const { error } = await searchParams;
  return <section className="site-shell py-14 sm:py-20"><form action={completeOnboarding} noValidate className="surface-card mx-auto max-w-lg p-6 sm:p-8"><p className="text-sm font-extrabold text-[var(--brand)]">첫 방문을 환영해요</p><h1 className="mt-2 text-3xl font-black">커뮤니티 프로필 만들기</h1><p className="mt-3 text-sm leading-6 text-[#587064]">소셜 계정 정보는 제안값일 뿐이며, 이 화면에서 확정한 프로필만 커뮤니티에 표시됩니다.</p><AvatarField userId={userId} initialUrl={defaults.avatarUrl} /><label className="mt-6 block text-sm font-extrabold">커뮤니티 닉네임<input required name="displayName" defaultValue={defaults.displayName} minLength={2} maxLength={24} className="mt-2 min-h-12 w-full rounded-xl border border-[var(--line)] px-3" /></label>{error ? <p role="alert" className="mt-4 text-sm font-bold text-red-700">{error}</p> : null}<button className="mt-7 min-h-12 w-full rounded-xl bg-[var(--brand)] px-4 text-sm font-extrabold text-white">프로필 확인 및 시작하기</button></form></section>;
}
