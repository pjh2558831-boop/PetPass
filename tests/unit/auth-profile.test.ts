import { describe, expect, it } from "vitest";
import {
  avatarUrlSchema,
  displayNameSchema,
  socialProfileDefaults,
} from "@/lib/auth/profile";

describe("community profile input", () => {
  it("normalizes a social name only as an onboarding default", () => {
    expect(
      socialProfileDefaults({ full_name: "  주말 멍멍이  ", avatar_url: "https://image" }),
    ).toEqual({ displayName: "주말 멍멍이", avatarUrl: "https://image" });
  });

  it("rejects empty and overlong community display names", () => {
    expect(displayNameSchema.safeParse(" ").success).toBe(false);
    expect(displayNameSchema.safeParse("a".repeat(25)).success).toBe(false);
  });

  it("accepts only empty or HTTPS avatar URLs", () => {
    expect(avatarUrlSchema.safeParse("").success).toBe(true);
    expect(avatarUrlSchema.safeParse("https://images.example/avatar.webp").success).toBe(true);
    expect(avatarUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(avatarUrlSchema.safeParse("http://images.example/avatar.jpg").success).toBe(false);
  });
});
