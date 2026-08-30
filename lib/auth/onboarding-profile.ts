type CommunityProfileInput = {
  displayName: string;
  avatarUrl: string;
};

type CommunityProfileValues = {
  display_name: string;
  avatar_url: string | null;
  onboarding_completed: true;
};

export type CommunityProfileWrite =
  | { kind: "insert"; values: CommunityProfileValues & { id: string } }
  | { kind: "update"; values: CommunityProfileValues };

export function buildCommunityProfileWrite(
  userId: string,
  profileExists: boolean,
  input: CommunityProfileInput,
): CommunityProfileWrite {
  const values: CommunityProfileValues = {
    display_name: input.displayName,
    avatar_url: input.avatarUrl || null,
    onboarding_completed: true,
  };

  return profileExists
    ? { kind: "update", values }
    : { kind: "insert", values: { id: userId, ...values } };
}
