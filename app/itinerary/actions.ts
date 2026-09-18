"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseSavedRouteRecommendation } from "@/lib/storage/recommendation-storage";
import { createAuthServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type SaveAccountItineraryResult = { ok: true; id: string } | { ok: false; message: string };

export async function saveAccountItinerary(value: unknown): Promise<SaveAccountItineraryResult> {
  const snapshot = parseSavedRouteRecommendation(value);
  if (!snapshot) return { ok: false, message: "저장할 일정 정보를 확인해 주세요." };
  const supabase = await createAuthServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = z.string().uuid().safeParse(data?.claims?.sub);
  if (!userId.success) return { ok: false, message: "로그인 후 일정을 저장할 수 있습니다." };
  const { data: saved, error } = await supabase.from("saved_itineraries").insert({
    user_id: userId.data,
    title: snapshot.route.label,
    snapshot: snapshot as unknown as Json,
  }).select("id").single();
  if (error) return { ok: false, message: error.message.includes("saved_itineraries_limit") ? "일정은 계정당 최대 5개까지 저장할 수 있습니다." : "일정을 저장하지 못했습니다." };
  revalidatePath("/account");
  return { ok: true, id: saved.id };
}

export async function deleteAccountItinerary(id: string) {
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return;
  const supabase = await createAuthServerClient();
  await supabase.from("saved_itineraries").delete().eq("id", parsedId.data);
  revalidatePath("/account");
}
