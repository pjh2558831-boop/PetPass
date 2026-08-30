import { describe, expect, it } from "vitest";
import { buildCommunityProfileWrite } from "@/lib/auth/onboarding-profile";

describe("onboarding community profile write", () => {
  const profile = {
    displayName: "주말멍멍이",
    avatarUrl: "https://images.example/avatar.webp",
  };

  it("inserts the owner id for a first profile", () => {
    expect(buildCommunityProfileWrite("user-id", false, profile)).toEqual({
      kind: "insert",
      values: {
        id: "user-id",
        display_name: "주말멍멍이",
        avatar_url: "https://images.example/avatar.webp",
        onboarding_completed: true,
      },
    });
  });

  it("updates only granted columns when the profile already exists", () => {
    expect(buildCommunityProfileWrite("user-id", true, profile)).toEqual({
      kind: "update",
      values: {
        display_name: "주말멍멍이",
        avatar_url: "https://images.example/avatar.webp",
        onboarding_completed: true,
      },
    });
  });
});
