export const LICENSE_STATUSES = [
  "VERIFIED_ACTIVE",
  "NO_MATCH",
  "NEEDS_CONFIRMATION",
  "NOT_APPLICABLE",
] as const;

export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

export interface LicenseVerification {
  status: LicenseStatus;
  reason: string;
  matchedBusinessName?: string;
  matchedAddress?: string;
  verifiedAt?: string;
  sourceName: string;
}

export const FOOD_LOCALDATA_DATASETS = [
  "general_restaurants",
  "rest_cafes",
] as const;

export const ACCOMMODATION_LOCALDATA_DATASETS = [
  "lodgings",
  "tourist_accommodations",
  "tourist_pensions",
] as const;

export const LOCALDATA_DATASETS = [
  ...FOOD_LOCALDATA_DATASETS,
  ...ACCOMMODATION_LOCALDATA_DATASETS,
] as const;

export type FoodLocalDataDataset = (typeof FOOD_LOCALDATA_DATASETS)[number];
export type AccommodationLocalDataDataset =
  (typeof ACCOMMODATION_LOCALDATA_DATASETS)[number];
export type LocalDataDataset = (typeof LOCALDATA_DATASETS)[number];

export type LicenseMatchState =
  | "matched_high"
  | "matched_possible"
  | "ambiguous"
  | "not_found"
  | "unavailable"
  | "not_applicable";

export type LicenseConfidence = "high" | "possible" | "none";
export type RefinedVenueKind =
  | "restaurant"
  | "cafe"
  | "pension"
  | "hotel"
  | "resort"
  | "accommodation"
  | null;
export type LicenseOperatingState =
  | "active"
  | "closed"
  | "suspended"
  | "unknown";
export type AggregateOperatingState =
  | LicenseOperatingState
  | "requires_confirmation";

export interface LocalDataSourceMetadata {
  provider: "Ministry of the Interior and Safety";
  dataset: LocalDataDataset;
  operation: "info";
  retrievedAt: string;
  providerUpdatedAt: string | null;
}

export interface LocalDataOriginalEvidence {
  managementNumber: string | null;
  businessName: string | null;
  roadAddress: string | null;
  parcelAddress: string | null;
  roadPostalCode: string | null;
  parcelPostalCode: string | null;
  licensingDate: string | null;
  businessStatusCode: string | null;
  businessStatusName: string | null;
  detailedStatusCode: string | null;
  detailedStatusName: string | null;
  closureDate: string | null;
  suspensionStartDate: string | null;
  suspensionEndDate: string | null;
  reopeningDate: string | null;
  phoneNumber: string | null;
  localGovernmentCode: string | null;
  businessCategory: string | null;
  businessSubtype: string | null;
  roomCount: string | null;
  facilityArea: string | null;
  providerUpdatedAt: string | null;
}

export interface LocalDataLicenseRecord {
  dataset: LocalDataDataset;
  businessName: string | null;
  roadAddress: string | null;
  parcelAddress: string | null;
  postalCode: string | null;
  licensingDate: string | null;
  businessStatusCode: string | null;
  businessStatusName: string | null;
  detailedStatusCode: string | null;
  detailedStatusName: string | null;
  closureDate: string | null;
  suspensionStartDate: string | null;
  suspensionEndDate: string | null;
  reopeningDate: string | null;
  phoneNumber: string | null;
  localGovernmentCode: string | null;
  businessCategory: string | null;
  businessSubtype: string | null;
  roomCount: string | null;
  facilityArea: string | null;
  providerUpdatedAt: string | null;
  operatingState: LicenseOperatingState;
  source: LocalDataSourceMetadata;
  sourceEvidence: LocalDataOriginalEvidence;
}

export interface LicenseScoreComponents {
  name: number;
  address: number;
  exactName: boolean;
  tokenOverlap: number;
  bigramSimilarity: number;
  branchAgreement: "agree" | "conflict" | "unknown";
  accommodationTypeAgreement: "agree" | "conflict" | "unknown";
  genericAccommodationName: boolean;
  roadAgreement: boolean;
  buildingNumberAgreement: "agree" | "conflict" | "unknown";
  districtAgreement: boolean;
  neighborhoodAgreement: boolean;
  parcelNumberAgreement: "agree" | "conflict" | "unknown";
  postalCodeAgreement: boolean;
}

export interface LicenseMatchCandidate {
  record: LocalDataLicenseRecord;
  totalScore: number;
  reasons: string[];
  components: LicenseScoreComponents;
}

export interface LicensingSectionState {
  status: "available" | "partial" | "unavailable";
  message?: string;
}

interface LicenseMatchResultBase {
  matchState: LicenseMatchState;
  refinedVenueKind: RefinedVenueKind;
  confidence: LicenseConfidence;
  totalScore: number | null;
  reasons: string[];
  sources: LocalDataSourceMetadata[];
  section: LicensingSectionState;
}

export interface FoodLicenseMatchResult extends LicenseMatchResultBase {
  licensingKind: "food";
  refinedVenueKind: "restaurant" | "cafe" | null;
  selectedRecord: LocalDataLicenseRecord | null;
  alternatives: LicenseMatchCandidate[];
  operatingState: LicenseOperatingState | null;
}

export interface AccommodationBusinessIdentity {
  businessName: string | null;
  address: string | null;
}

export interface AccommodationEntityCandidate {
  identity: AccommodationBusinessIdentity;
  aggregateScore: number;
  records: LicenseMatchCandidate[];
  reasons: string[];
  operatingStateDiscrepancy: boolean;
}

export interface AccommodationDatasetMatchResult {
  dataset: AccommodationLocalDataDataset;
  candidateCount: number;
  matchState: LicenseMatchState;
  confidence: LicenseConfidence;
  totalScore: number | null;
  selectedRecords: LocalDataLicenseRecord[];
  alternatives: LicenseMatchCandidate[];
  source: LocalDataSourceMetadata | null;
}

export interface AccommodationLicenseMatchResult extends LicenseMatchResultBase {
  licensingKind: "accommodation";
  refinedVenueKind: "pension" | "hotel" | "resort" | "accommodation" | null;
  matchedBusiness: AccommodationBusinessIdentity | null;
  selectedRecords: LocalDataLicenseRecord[];
  perDatasetResults: AccommodationDatasetMatchResult[];
  alternatives: AccommodationEntityCandidate[];
  operatingState: AggregateOperatingState | null;
  operatingStateDiscrepancy: boolean;
}

export type LicensingMatchResult =
  | FoodLicenseMatchResult
  | AccommodationLicenseMatchResult;
