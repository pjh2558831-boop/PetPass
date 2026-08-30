import { redirect } from "next/navigation";
import { OAuthLoginButtons } from "@/components/auth/oauth-login-buttons";
import { createAuthServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string }>;
}) {
  const supabase = await createAuthServerClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", userId)
      .maybeSingle();
    redirect(profile?.onboarding_completed ? "/account" : "/onboarding");
  }

  const { error, mode: requestedMode } = await searchParams;
  const mode = requestedMode === "signup" ? "signup" : "login";
  const kakaoEnabled = process.env.KAKAO_LOGIN_ENABLED === "true";
  return <section className="site-shell py-14 sm:py-20"><div className="surface-card mx-auto max-w-md p-6 sm:p-8"><p className="text-sm font-extrabold text-[var(--brand)]">WEEKENDOG 계정</p><h1 className="mt-2 text-3xl font-black tracking-tight">{mode === "signup" ? "새 계정으로 여행을 시작하세요" : "반려견 여행을 이어가세요"}</h1><p className="mt-3 text-sm leading-6 text-[#587064]">{mode === "signup" ? "소셜 계정으로 가입한 뒤 커뮤니티 프로필을 만들 수 있습니다." : "커뮤니티 프로필과 저장 기능을 위한 소셜 로그인입니다."}</p>{error ? <p role="alert" className="mt-5 rounded-xl border border-[#e5bdb7] bg-[#fff1ef] p-3 text-sm font-bold text-[#823f36]">소셜 로그인을 완료하지 못했습니다. 계정 선택과 동의 항목을 확인한 뒤 다시 시도해 주세요.</p> : null}<div className="mt-7"><OAuthLoginButtons mode={mode} kakaoEnabled={kakaoEnabled} /></div></div></section>;
}
