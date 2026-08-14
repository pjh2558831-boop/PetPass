import type {
  KakaoPlaceSearchPage,
  KakaoPlaceSearchResult,
} from "@/types/kakao";
import type {
  PetTravelCandidateCategory,
  PlaceCandidateKind,
} from "@/types/place-candidate";

export type CollectionCandidateKind = PlaceCandidateKind;

export interface KakaoCollectionDistrict {
  code: string;
  name: string;
}

export interface KakaoCollectionQuery {
  key: string;
  text: string;
  district: KakaoCollectionDistrict;
  family: string;
  candidateKind: CollectionCandidateKind;
  categoryGroupCode?: string;
  categoryHint?: PetTravelCandidateCategory | null;
}

export interface KakaoCollectionCandidate {
  providerPlaceId: string;
  name: string;
  categoryName: string;
  categoryGroupCode?: string;
  categoryGroupName?: string;
  addressName: string;
  roadAddressName?: string;
  coordinates: {
    longitude: number;
    latitude: number;
  };
  phone?: string;
  placeUrl: string;
  district: KakaoCollectionDistrict;
  candidateKind: CollectionCandidateKind;
  normalizedCategory: PetTravelCandidateCategory | null;
}

export interface KakaoCollectionQueryCandidate {
  candidate: KakaoCollectionCandidate;
  page: number;
  resultRank: number;
}

export interface KakaoCollectionProvider {
  searchPage(
    input: {
      query: string;
      page: number;
      size: number;
      categoryGroupCode?: string;
    },
    options: { timeoutMs: number },
  ): Promise<KakaoPlaceSearchPage>;
}

export interface KakaoCollectionClassificationAdapter {
  classify(
    result: KakaoPlaceSearchResult,
    query: KakaoCollectionQuery,
  ): KakaoCollectionCandidate | null;
  validateDistrict(
    result: KakaoPlaceSearchResult,
    query: KakaoCollectionQuery,
  ): boolean;
}

export interface KakaoCollectionPlanFilters {
  district?: string;
  kind?: string;
}
