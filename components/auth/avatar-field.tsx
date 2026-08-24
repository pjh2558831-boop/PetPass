"use client";

import { useState } from "react";
import Image from "next/image";
import { UserRound } from "lucide-react";
import { createAuthBrowserClient } from "@/lib/supabase/auth-client";

export function AvatarField({ userId, initialUrl }: { userId: string; initialUrl: string | null }) {
  const [avatarUrl, setAvatarUrl] = useState(initialUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  async function upload(file: File) {
    const extensions = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    } as const;
    const extension = extensions[file.type as keyof typeof extensions];
    if (!extension || file.size > 2 * 1024 * 1024) { setError("2MB 이하의 PNG, JPEG, WebP 이미지만 올릴 수 있습니다."); return; }
    setError(null);
    setUploading(true);
    const supabase = createAuthBrowserClient();
    const path = `${userId}/avatar.${extension}`;
    const { error: uploadError } = await supabase.storage.from("profile-avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) { setError("이미지를 올리지 못했습니다. 다시 시도해 주세요."); setUploading(false); return; }
    const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    setUploading(false);
  }
  return <div className="mt-6"><div className="flex items-center gap-4"><div className="grid size-[72px] place-items-center overflow-hidden rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">{avatarUrl ? <Image src={avatarUrl} alt="선택한 프로필 이미지" width={72} height={72} unoptimized className="size-full object-cover" /> : <UserRound size={36} strokeWidth={1.8} aria-hidden="true" />}</div><div><p className="font-extrabold">프로필 사진</p><div className="mt-1 flex flex-wrap gap-2"><label className={`inline-flex rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-extrabold ${uploading ? "cursor-wait opacity-60" : "cursor-pointer"}`}>{uploading ? "업로드 중…" : "이미지 변경"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label>{avatarUrl ? <button type="button" disabled={uploading} onClick={() => { setAvatarUrl(""); setError(null); }} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-extrabold text-[#607168] disabled:opacity-60">기본 아바타 사용</button> : null}</div></div></div><input type="hidden" name="avatarUrl" value={avatarUrl} />{error ? <p role="alert" className="mt-2 text-sm font-bold text-red-700">{error}</p> : null}</div>;
}
