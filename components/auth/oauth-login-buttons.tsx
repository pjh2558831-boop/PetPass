"use client";

import { useState } from "react";
import { createAuthBrowserClient } from "@/lib/supabase/auth-client";

export function OAuthLoginButtons() {
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
      <button type="button" onClick={() => signIn("google")} disabled={loading !== null} className="flex min-h-12 w-full items-center justify-center rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-extrabold text-[#263d32] disabled:opacity-60">
        {loading === "google" ? "Google로 이동 중…" : "Google로 계속하기"}
      </button>
      <button type="button" onClick={() => signIn("kakao")} disabled={loading !== null} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#FEE500] px-4 text-sm font-extrabold text-[#191600] disabled:opacity-60">
        {loading === "kakao" ? "카카오로 이동 중…" : "카카오로 계속하기"}
      </button>
      {error ? <p role="alert" className="text-sm font-bold text-red-700">{error}</p> : null}
    </div>
  );
}
