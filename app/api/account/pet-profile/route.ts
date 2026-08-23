import { NextResponse } from "next/server";
import {
  savedPetProfileFromRow,
  savedPetProfileInputSchema,
  savedPetProfileToRow,
} from "@/lib/auth/pet-profile";
import { createAuthServerClient } from "@/lib/supabase/server";

const MAX_REQUEST_BYTES = 16 * 1024;

export async function PUT(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { error: "반려동물 정보가 너무 큽니다." },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "반려동물 정보 형식을 확인해 주세요." },
      { status: 400 },
    );
  }

  const parsed = savedPetProfileInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "반려동물 정보를 다시 확인해 주세요." },
      { status: 422 },
    );
  }

  const supabase = await createAuthServerClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const payload = savedPetProfileToRow(userId, {
    id: userId,
    ...parsed.data,
  });
  const { data, error } = await supabase
    .from("pet_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("user_id, name, species, size, has_carrier, has_leash, has_muzzle, accepts_outdoor_only, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "반려동물 정보를 저장하지 못했습니다." },
      { status: 500 },
    );
  }

  return NextResponse.json({ profile: savedPetProfileFromRow(data) });
}
