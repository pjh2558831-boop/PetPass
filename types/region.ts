export const REGION_IDS = ["busan", "jeju"] as const;

export type RegionId = (typeof REGION_IDS)[number];
