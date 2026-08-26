export const REGION_IDS = ["busan", "jeju", "seoul"] as const;

export type RegionId = (typeof REGION_IDS)[number];
