"use client";

import { useState } from "react";
import { createAuthBrowserClient } from "@/lib/supabase/auth-client";

function KakaoLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0" fill="none">
      <path
        fill="currentColor"
        d="M12 3C6.48 3 2 6.49 2 10.8c0 2.77 1.86 5.2 4.66 6.59l-1.18 4.08a.45.45 0 0 0 .67.51l4.75-3.13c.36.03.73.05 1.1.05 5.52 0 10-3.49 10-7.8S17.52 3 12 3Z"
      />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.38l-3.24-2.53c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.13H3.06v2.61A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 13.92A6 6 0 0 1 6.08 12c0-.67.12-1.32.32-1.92V7.47H3.06A10 10 0 0 0 2 12c0 1.62.39 3.15 1.06 4.53l3.34-2.61Z" />
      <path fill="#EA4335" d="M12 5.95c1.47 0 2.78.5 3.82 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.94 5.47l3.34 2.61c.79-2.37 3-4.13 5.6-4.13Z" />
    </svg>
  );
}

export function OAuthLoginButtons({
  mode = "login",
  kakaoEnabled = false,
}: {
  mode?: "login" | "signup";
  kakaoEnabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"google" | "kakao" | null>(null);

  async function signIn(provider: "google" | "kakao") {
    setError(null);
    setLoading(provider);
    const supabase = createAuthBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (signInError) {
      setError("로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => signIn("kakao")} disabled={!kakaoEnabled || loading !== null} aria-describedby={!kakaoEnabled ? "kakao-login-status" : undefined} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-[#FEE500] px-4 text-sm font-extrabold text-[#191600] disabled:cursor-not-allowed disabled:opacity-60">
        <KakaoLogo />
        {!kakaoEnabled
          ? "카카오 로그인 준비 중"
          : loading === "kakao"
            ? "카카오로 이동 중…"
            : mode === "signup"
              ? "카카오로 회원가입"
              : "카카오로 계속하기"}
      </button>
      {!kakaoEnabled ? <p id="kakao-login-status" className="text-xs font-semibold leading-5 text-[#6b756f]">카카오 로그인은 잠시 사용할 수 없어요. Google로 계속해 주세요.</p> : null}
      <button type="button" onClick={() => signIn("google")} disabled={loading !== null} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-extrabold text-[#263d32] disabled:opacity-60">
        <GoogleLogo />
        {loading === "google" ? "Google로 이동 중…" : mode === "signup" ? "Google로 회원가입" : "Google로 계속하기"}
      </button>
      {error ? <p role="alert" className="text-sm font-bold text-red-700">{error}</p> : null}
    </div>
  );
}
