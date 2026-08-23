import { z } from "zod";

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "커뮤니티 닉네임은 2자 이상이어야 합니다.")
  .max(24, "커뮤니티 닉네임은 24자 이하여야 합니다.")
  .regex(/^[\p{L}\p{N}_-]+$/u, "한글, 영문, 숫자, 밑줄, 하이픈만 사용할 수 있습니다.");

export const avatarUrlSchema = z.union([
  z.literal(""),
  z
    .string()
    .trim()
    .max(2_048)
    .url()
    .refine((value) => new URL(value).protocol === "https:", {
      message: "프로필 이미지는 HTTPS 주소만 사용할 수 있습니다.",
    }),
]);

export type CommunityProfile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  onboarding_completed: boolean;
};

export function socialProfileDefaults(metadata: Record<string, unknown>) {
  const nameCandidate = [metadata.full_name, metadata.name, metadata.nickname, metadata.preferred_username].find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  const name = nameCandidate?.trim() ?? "";
  const avatarUrl = typeof metadata.avatar_url === "string" ? metadata.avatar_url : null;
  return { displayName: name.slice(0, 24), avatarUrl };
}
