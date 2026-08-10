import type { LicenseOperatingState } from "@/types/license";
import type { Coordinates } from "@/types/place";

export const PLACE_SOURCE_LAYER_IDS = [
  "tourism_official",
  "business_confirmed",
  "administrator_confirmed",
  "user_reported",
  "kakao_discovery",
] as const;

export type PlaceSourceLayerId = (typeof PLACE_SOURCE_LAYER_IDS)[number];

export interface ProviderPlaceId {
  provider: string;
  id: string;
}

export interface PlaceSourceConflict {
  code:
    | "name_conflict"
    | "address_conflict"
    | "phone_conflict"
    | "coordinate_conflict"
    | "pet_policy_conflict"
    | "operational_status_conflict";
  summary: string;
}

export interface PlaceSourceRecord {
  recordId: string;
  layer: PlaceSourceLayerId;
  provider: string;
  providerIds: ProviderPlaceId[];
  name: string | null;
  roadAddress: string | null;
  lotNumberAddress: string | null;
  phone: string | null;
  coordinates: Coordinates | null;
  retrievedAt: string;
  verifiedAt?: string | null;
  evidenceSummary?: string | null;
  sourceUrl?: string | null;
  conflicts: PlaceSourceConflict[];
}

export type ProviderLinkClassification =
  | "exact"
  | "probable"
  | "possible"
  | "unmatched";

export interface ProviderLinkComponents {
  exactRoadAddress: boolean;
  exactName: boolean;
  exactPhone: boolean;
  coordinateDistanceMeters: number | null;
  matchingProviderId: boolean;
}

export interface ProviderLinkAssessment {
  classification: ProviderLinkClassification;
  sourceRecordIds: [string, string];
  providerIds: ProviderPlaceId[];
  reasons: string[];
  conflicts: PlaceSourceConflict[];
  components: ProviderLinkComponents;
  requiresReview: boolean;
}

export type PlaceTrustLevel = "high" | "medium" | "low";

export interface PlaceTrustComponent {
  code:
    | "source_baseline"
    | "tourism_pet_evidence"
    | "tourism_without_pet_evidence"
    | "business_confirmation"
    | "administrator_confirmation"
    | "consistent_user_report"
    | "kakao_discovery_baseline"
    | "stale_verification"
    | "source_conflict"
    | "missing_evidence"
    | "closed_license_flag";
  label: string;
  points: number;
  kind: "evidence" | "penalty" | "context" | "flag";
  observedAt?: string;
}

export interface PlaceTrustResult {
  ruleVersion: string;
  score: number;
  level: PlaceTrustLevel;
  evidenceCount: number;
  computedAt: string;
  components: PlaceTrustComponent[];
  flags: Array<
    | "verification_required"
    | "conflicting_sources"
    | "operational_status_conflict"
    | "missing_evidence"
  >;
}

export interface PlaceTrustSignalInput {
  computedAt: string;
  hasAnySource: boolean;
  tourism?: {
    hasPetSpecificEvidence: boolean;
    retrievedAt: string;
  };
  businessConfirmation?: { verifiedAt: string };
  administratorConfirmation?: { verifiedAt: string };
  consistentUserReports?: Array<{ observedAt: string }>;
  kakaoDiscoveryOnly?: boolean;
  sourceConflictCount?: number;
  licensingOperatingState?: LicenseOperatingState | "requires_confirmation" | null;
}
