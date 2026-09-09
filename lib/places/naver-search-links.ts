// No result retrieval or mode switch: external navigation only.
export const NAVER_PLACE_MODE = "external_link_only" as const;

export function buildNaverPlaceLinks(place: { name: string; address?: string | null }) {
  const name = place.name.trim();
  if (!name || ["이름 확인 필요", "이름 미확인"].includes(name)) return null;
  const address = place.address?.trim();
  const query = [name, address && address !== "주소 확인 필요" ? address : null].filter(Boolean).join(" ");
  const url = (where: string) => `https://search.naver.com/search.naver?${new URLSearchParams({ where, query })}`;
  return { local: url("nexearch"), image: url("image") };
}
