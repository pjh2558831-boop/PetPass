"use client";

import { LogIn, MessageCircle } from "lucide-react";
import { useState } from "react";
import { createAuthBrowserClient } from "@/lib/supabase/auth-client";
import { FormErrorMessage } from "@/components/ui/form-error-message";

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
      {kakaoEnabled ? (
        <button type="button" onClick={() => signIn("kakao")} disabled={loading !== null} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-lg bg-[#FEE500] px-4 text-sm font-extrabold text-[#191600] disabled:cursor-not-allowed disabled:opacity-60">
          <MessageCircle size={19} aria-hidden="true" />
          {loading === "kakao"
            ? "카카오로 이동 중…"
            : mode === "signup"
              ? "카카오로 회원가입"
              : "카카오로 계속하기"}
        </button>
      ) : null}
      <button type="button" onClick={() => signIn("google")} disabled={loading !== null} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-extrabold text-[#263d32] disabled:opacity-60">
        <LogIn size={19} aria-hidden="true" />
        {loading === "google" ? "Google로 이동 중…" : mode === "signup" ? "Google로 회원가입" : "Google로 계속하기"}
      </button>
      {loading ? <p className="sr-only" role="status">소셜 로그인 화면으로 이동하고 있습니다.</p> : null}
      {error ? <FormErrorMessage id="oauth-provider-error" className="text-sm font-bold text-red-700">{error}</FormErrorMessage> : null}
    </div>
  );
}
