import { getRegionConfig } from "@/lib/regions/config";
import type { RegionId } from "@/types/region";

export const REGION_SELECTOR_GROUPS = [
  { label: "수도권", regionIds: ["seoul", "gyeonggi", "incheon"] },
  {
    label: "광역시",
    regionIds: ["busan", "daegu", "gwangju", "daejeon", "ulsan", "sejong"],
  },
  {
    label: "도 지역",
    regionIds: [
      "gangwon", "chungbuk", "chungnam", "jeonbuk",
      "jeonnam", "gyeongbuk", "gyeongnam", "jeju",
    ],
  },
] as const satisfies readonly {
  label: string;
  regionIds: readonly RegionId[];
}[];

const REGION_SEARCH_ALIASES: Record<RegionId, readonly string[]> = {
  seoul: ["서울", "서울특별시"],
  incheon: ["인천", "인천광역시"],
  daejeon: ["대전", "대전광역시"],
  daegu: ["대구", "대구광역시"],
  gwangju: ["광주", "광주광역시"],
  busan: ["부산", "부산광역시"],
  ulsan: ["울산", "울산광역시"],
  sejong: ["세종", "세종시", "세종특별자치시"],
  gyeonggi: ["경기", "경기도"],
  gangwon: ["강원", "강원도", "강원특별자치도"],
  chungbuk: ["충북", "충청북도"],
  chungnam: ["충남", "충청남도"],
  gyeongbuk: ["경북", "경상북도"],
  gyeongnam: ["경남", "경상남도"],
  jeonbuk: ["전북", "전라북도", "전북특별자치도"],
  jeonnam: ["전남", "전라남도"],
  jeju: ["제주", "제주도", "제주특별자치도"],
};

export interface RegionSelectorOption {
  id: RegionId;
  displayName: string;
  searchText: string;
}

export const REGION_SELECTOR_OPTIONS = REGION_SELECTOR_GROUPS.flatMap(
  ({ regionIds }) => regionIds.map((id): RegionSelectorOption => ({
    id,
    displayName: getRegionConfig(id).displayName,
    searchText: REGION_SEARCH_ALIASES[id].join(" ").toLocaleLowerCase("ko-KR"),
  })),
);

export function filterRegionSelectorOptions(query: string): RegionSelectorOption[] {
  const normalized = query.trim().toLocaleLowerCase("ko-KR");
  return normalized
    ? REGION_SELECTOR_OPTIONS.filter(({ searchText }) => searchText.includes(normalized))
    : [...REGION_SELECTOR_OPTIONS];
}
