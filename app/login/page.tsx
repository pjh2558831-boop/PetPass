import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { OAuthLoginButtons } from "@/components/auth/oauth-login-buttons";
import { FormErrorMessage } from "@/components/ui/form-error-message";
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
  const kakaoEnabled = process.env.KAKAO_LOGIN_ENABLED !== "false";
  return (
    <section className="site-shell py-12 sm:py-16">
      <div className="auth-document mx-auto max-w-lg">
        <Link href="/" aria-label="WEEKENDOG 홈" className="inline-flex min-h-11 items-center">
          <Image src="/brand/weekendog-primary.png" alt="" width={548} height={480} unoptimized className="weekendog-logo weekendog-logo--primary" />
        </Link>
        <h1 className="mt-5 text-3xl font-black tracking-[-0.045em]">
          {mode === "signup" ? "새 계정으로 여행을 시작하세요" : "반려견 여행을 이어가세요"}
        </h1>
        <p className="mt-3 text-sm leading-7 text-[#587064]">
          {mode === "signup"
            ? "소셜 계정으로 가입한 뒤 사용할 이름과 프로필 사진을 정할 수 있습니다."
            : "저장한 일정과 반려동물 정보를 이어서 관리하려면 로그인해 주세요."}
        </p>
        {error ? (
          <FormErrorMessage id="login-oauth-error" className="auth-document__alert mt-5">
            소셜 로그인을 완료하지 못했습니다. 계정 선택과 동의 항목을 확인한 뒤 다시 시도해 주세요.
          </FormErrorMessage>
        ) : null}
        <div className="mt-7"><OAuthLoginButtons mode={mode} kakaoEnabled={kakaoEnabled} /></div>
        <p className="mt-6 border-t border-[var(--line)] pt-5 text-sm text-[var(--muted)]">
          {mode === "signup" ? "이미 계정이 있나요? " : "처음 이용하시나요? "}
          <Link href={mode === "signup" ? "/login" : "/login?mode=signup"} className="font-extrabold text-[var(--brand)] underline underline-offset-4">
            {mode === "signup" ? "로그인" : "회원가입"}
          </Link>
        </p>
      </div>
    </section>
  );
}
