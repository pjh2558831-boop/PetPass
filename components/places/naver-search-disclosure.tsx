import { Disclosure } from "@/components/ui/disclosure";
import { buildNaverPlaceLinks } from "@/lib/places/naver-search-links";

export function NaverSearchDisclosure({ name, address }: { name: string; address?: string | null }) {
  const links = buildNaverPlaceLinks({ name, address });
  if (!links) return null;
  return (
    <Disclosure label="외부 검색으로 더 확인" idPrefix="naver-search" className="naver-search-disclosure">
      <p>검색 결과는 보조 정보이며, 이름이 같은 다른 장소가 포함될 수 있습니다. 사진은 해당 장소·지점인지 확인해 주세요.</p>
      <a href={links.local} target="_blank" rel="noopener noreferrer">네이버에서 장소 정보 확인<span className="sr-only"> (새 창)</span></a>
      <a href={links.image} target="_blank" rel="noopener noreferrer">네이버에서 이미지 검색<span className="sr-only"> (새 창)</span></a>
    </Disclosure>
  );
}
