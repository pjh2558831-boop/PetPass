"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { avatarUrlSchema, displayNameSchema, getDisplayNameChangeAvailability } from "@/lib/auth/profile";
import { createAuthServerClient } from "@/lib/supabase/server";

function profileError(message: string): never {
  redirect(`/account/profile?error=${encodeURIComponent(message)}`);
}

export async function updateAccountProfile(formData: FormData) {
  const displayName = displayNameSchema.safeParse(formData.get("displayName"));
  const avatarEntry = formData.get("avatarUrl");
  const avatarUrl = avatarUrlSchema.safeParse(typeof avatarEntry === "string" ? avatarEntry : "");
  if (!displayName.success) profileError(displayName.error.issues[0]?.message ?? "닉네임을 확인해 주세요.");
  if (!avatarUrl.success) profileError("프로필 이미지 주소를 확인해 주세요.");

  const supabase = await createAuthServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");
  const { data: current, error: readError } = await supabase.from("profiles").select("display_name, display_name_changed_at").eq("id", userId).maybeSingle();
  if (readError || !current) profileError("프로필을 불러오지 못했습니다.");

  if (displayName.data !== current.display_name && !getDisplayNameChangeAvailability(current.display_name_changed_at).allowed) {
    profileError("닉네임은 마지막 변경일로부터 30일 후 다시 변경할 수 있습니다.");
  }
  const { error } = await supabase.from("profiles").update({ display_name: displayName.data, avatar_url: avatarUrl.data || null }).eq("id", userId);
  if (error) {
    if (error.code === "23505") profileError("이미 사용 중인 닉네임입니다.");
    if (error.message.includes("display_name_change_cooldown")) profileError("닉네임은 30일에 한 번만 변경할 수 있습니다.");
    profileError("프로필을 저장하지 못했습니다.");
  }
  revalidatePath("/account");
  revalidatePath("/");
  redirect("/account?profile=updated");
}
