import type {
  KakaoCollectionClassificationAdapter,
  KakaoCollectionQuery,
} from "@/lib/kakao/collection/contracts";
import { classifyKakaoCollectionCandidate } from "@/lib/kakao/collection/classification";
import type { KakaoBusanCollectionQuery } from "@/lib/kakao/collection/query-registry-v1";
import { validateKakaoBusanCollectionResult } from "@/lib/kakao/collection/validation";
import { parseKakaoPlaceUrl } from "@/lib/kakao/place-url";

function normalizedText(value: string | undefined): string | null {
  const normalized = value
    ?.normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();
  return normalized || null;
}

export function mapKakaoBusanCollectionQuery(
  query: KakaoBusanCollectionQuery,
): KakaoCollectionQuery {
  return {
    key: query.key,
    text: query.queryText,
    district: { code: query.districtCode, name: query.districtName },
    family: query.family,
    candidateKind: query.candidateKind,
    categoryHint: query.normalizedCategoryHint,
    ...(query.categoryGroupCode
      ? { categoryGroupCode: query.categoryGroupCode }
      : {}),
  };
}

export function createKakaoBusanCollectorAdapter(
  sourceQueries: readonly KakaoBusanCollectionQuery[],
): {
  queries: KakaoCollectionQuery[];
  classification: KakaoCollectionClassificationAdapter;
} {
  const sourceByKey = new Map(sourceQueries.map((query) => [query.key, query]));

  function sourceQuery(query: KakaoCollectionQuery): KakaoBusanCollectionQuery {
    const source = sourceByKey.get(query.key);
    if (!source) {
      throw new Error("Collection query is not present in the registry adapter.");
    }
    return source;
  }

  return {
    queries: sourceQueries.map(mapKakaoBusanCollectionQuery),
    classification: {
      validateDistrict(result, query) {
        return validateKakaoBusanCollectionResult(
          result,
          sourceQuery(query).districtCode,
        ).accepted;
      },
      classify(result, query) {
        const source = sourceQuery(query);
        const validation = validateKakaoBusanCollectionResult(
          result,
          source.districtCode,
        );
        const classification = classifyKakaoCollectionCandidate(result, source);
        if (!validation.accepted || !validation.district || !classification) {
          return null;
        }
        const name = normalizedText(result.name);
        const categoryName = normalizedText(result.categoryName);
        if (!name) return null;
        if (!categoryName) return null;
        const providerPlaceId = result.id.trim();
        if (!/^\d{1,128}$/u.test(providerPlaceId)) return null;
        const canonicalPlaceUrl = `https://place.map.kakao.com/${providerPlaceId}`;
        const parsedPlaceUrl = result.placeUrl
          ? parseKakaoPlaceUrl(result.placeUrl)
          : null;
        if (parsedPlaceUrl && parsedPlaceUrl !== canonicalPlaceUrl) return null;
        const placeUrl = parsedPlaceUrl ?? canonicalPlaceUrl;

        const addressName =
          normalizedText(result.address) ??
          normalizedText(validation.canonicalAddress ?? undefined);
        if (!addressName) return null;
        const roadAddressName = normalizedText(result.roadAddress);
        const categoryGroupCode = result.categoryGroupCode?.trim() || null;
        const categoryGroupName = normalizedText(result.categoryGroupName);
        const phone = normalizedText(result.phone);

        return {
          providerPlaceId,
          name,
          categoryName,
          ...(categoryGroupCode
            ? { categoryGroupCode }
            : {}),
          ...(categoryGroupName
            ? { categoryGroupName }
            : {}),
          addressName,
          ...(roadAddressName
            ? { roadAddressName }
            : {}),
          coordinates: result.coordinates,
          ...(phone ? { phone } : {}),
          placeUrl,
          district: validation.district,
          candidateKind: classification.candidateKind,
          normalizedCategory: classification.normalizedCategory,
        };
      },
    },
  };
}
