"use server";

import { redirect } from "next/navigation";
import { avatarUrlSchema, displayNameSchema } from "@/lib/auth/profile";
import { createAuthServerClient } from "@/lib/supabase/server";

export async function completeOnboarding(formData: FormData) {
  const parsed = displayNameSchema.safeParse(formData.get("displayName"));
  if (!parsed.success) redirect(`/onboarding?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "닉네임을 확인해 주세요.")}`);
  const avatarUrlEntry = formData.get("avatarUrl");
  const parsedAvatarUrl = avatarUrlSchema.safeParse(
    typeof avatarUrlEntry === "string" ? avatarUrlEntry : "",
  );
  if (!parsedAvatarUrl.success) {
    redirect(
      `/onboarding?error=${encodeURIComponent("프로필 이미지 주소를 확인해 주세요.")}`,
    );
  }
  const avatarUrl = parsedAvatarUrl.data;
  const supabase = await createAuthServerClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");
  const { error } = await supabase.from("profiles").upsert({ id: userId, display_name: parsed.data, avatar_url: avatarUrl || null, onboarding_completed: true });
  if (error) {
    const message = error.code === "23505" ? "이미 사용 중인 닉네임입니다." : "프로필을 저장하지 못했습니다.";
    redirect(`/onboarding?error=${encodeURIComponent(message)}`);
  }
  redirect("/");
}
