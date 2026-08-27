export const REGION_IDS = [
  "busan",
  "jeju",
  "seoul",
  "incheon",
  "gyeonggi",
] as const;

export type RegionId = (typeof REGION_IDS)[number];
