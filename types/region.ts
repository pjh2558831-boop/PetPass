export const REGION_IDS = [
  "seoul",
  "incheon",
  "daejeon",
  "daegu",
  "gwangju",
  "busan",
  "ulsan",
  "sejong",
  "gyeonggi",
  "gangwon",
  "chungbuk",
  "chungnam",
  "gyeongbuk",
  "gyeongnam",
  "jeonbuk",
  "jeonnam",
  "jeju",
] as const;

export type RegionId = (typeof REGION_IDS)[number];
