import type { PetAccessAssessment, PetPolicy } from "@/types/access";
import type {
  LicenseVerification,
  LicensingMatchResult,
  LicensingSectionState,
} from "@/types/license";
import type { PlaceCategory } from "@/types/pet";
import type { TourPetAccessAssessment } from "@/types/tour-pet-access";
import type { PlaceSourceRecord, PlaceTrustResult } from "@/types/place-source";

export interface DataSourceMetadata {
  sourceName: string;
  sourceUrl?: string;
  retrievedAt: string;
  modifiedAt?: string;
  isDemo: boolean;
  copyrightCode?: string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface PetPlace {
  contentId: string;
  contentTypeId: string;
  name: string;
  category: PlaceCategory;
  address: string;
  coordinates: Coordinates;
  phone?: string;
  imageUrl?: string;
  summary: string;
  openingHours?: string;
  closedDays?: string;
  parking?: string;
  petPolicy: PetPolicy;
  accessAssessment: PetAccessAssessment;
  licenseVerification: LicenseVerification;
  source: DataSourceMetadata;
}

export const TOUR_CONTENT_TYPE_IDS = [
  "12",
  "14",
  "15",
  "28",
  "32",
  "38",
  "39",
] as const;

export type TourContentTypeId = (typeof TOUR_CONTENT_TYPE_IDS)[number];

export type TourPlaceCategory =
  | "leisure"
  | "attraction"
  | "transportation"
  | "culture"
  | "shopping"
  | "accommodation"
  | "food"
  | "festival"
  | "unknown";

export type TourOperationName =
  | "areaBasedList2"
  | "detailCommon2"
  | "detailIntro2"
  | "detailPetTour2";

export interface TourClassificationCodes {
  primary: string | null;
  secondary: string | null;
  tertiary: string | null;
  largeCategory: string | null;
  middleCategory: string | null;
  smallCategory: string | null;
}

export interface TourSourceReference {
  provider: "Korea Tourism Organization";
  operation: TourOperationName;
  retrievedAt: string;
  contentId?: string;
  providerModifiedTime?: string | null;
}

export interface TourPlaceSummary {
  contentId: string;
  contentTypeId: TourContentTypeId | null;
  providerContentTypeId: string | null;
  category: TourPlaceCategory;
  title: string | null;
  address: string | null;
  detailAddress: string | null;
  longitude: number | null;
  latitude: number | null;
  phone: string | null;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  copyrightType: string | null;
  createdTime: string | null;
  modifiedTime: string | null;
  legalRegionCode: string | null;
  legalDistrictCode: string | null;
  classificationCodes: TourClassificationCodes;
  source: TourSourceReference;
}

export interface TourPlaceList {
  places: TourPlaceSummary[];
  page: number;
  pageSize: number;
  totalCount: number;
  source: TourSourceReference;
}

export interface TourPetPolicyFields {
  acmpyTypeCd: string | null;
  acmpyPsblCpam: string | null;
  acmpyNeedMtr: string | null;
  etcAcmpyInfo: string | null;
  relaAcdntRiskMtr: string | null;
  relaPosesFclty: string | null;
  relaFrnshPrdlst: string | null;
  relaPurcPrdlst: string | null;
  relaRntlPrdlst: string | null;
}

export interface TourPetPolicyEvidence {
  fields: TourPetPolicyFields;
  sourceEvidence: TourSourceReference & {
    operation: "detailPetTour2";
    contentId: string;
    originalEvidenceFields: TourPetPolicyFields;
  };
}

export type TourIntroPetPolicyField =
  | "chkpet"
  | "chkpetculture"
  | "chkpetleports"
  | "chkpetshopping";

export interface TourIntroPetPolicyEvidence {
  field: TourIntroPetPolicyField;
  value: string;
  sourceEvidence: TourSourceReference & {
    operation: "detailIntro2";
    contentId: string;
    originalValue: string;
  };
}

export type TourDetailSectionName = "common" | "intro" | "petPolicy";

export interface TourDetailSectionState {
  status: "available" | "partial" | "unavailable";
  message?: string;
}

export interface TourPlaceDetail {
  summary: TourPlaceSummary;
  overview: string | null;
  homepageUrl: string | null;
  operatingInformation: string | null;
  restDayInformation: string | null;
  parkingInformation: string | null;
  reservationInformation: string | null;
  contactInformation: string | null;
  providerModifiedTime: string | null;
  petPolicyEvidence: TourPetPolicyEvidence | null;
  introPetPolicyEvidence: TourIntroPetPolicyEvidence | null;
  licensing?: LicensingMatchResult;
  sections: Record<TourDetailSectionName, TourDetailSectionState> & {
    licensing?: LicensingSectionState;
  };
  source: TourSourceReference;
}

export interface TourPlaceDetailResponse extends TourPlaceDetail {
  petAccessAssessment: TourPetAccessAssessment;
  sourceRecords: PlaceSourceRecord[];
  trust: PlaceTrustResult;
}
