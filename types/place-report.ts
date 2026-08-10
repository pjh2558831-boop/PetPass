import type { ProviderPlaceId } from "@/types/place-source";

export const PLACE_INFORMATION_REPORT_TYPES = [
  "pet_policy_changed",
  "business_closed",
  "location_incorrect",
  "contact_incorrect",
  "other",
] as const;

export type PlaceInformationReportType =
  (typeof PLACE_INFORMATION_REPORT_TYPES)[number];

export const PLACE_INFORMATION_REPORT_STATUSES = [
  "draft",
  "pending_review",
  "in_review",
  "approved",
  "rejected",
] as const;

export type PlaceInformationReportStatus =
  (typeof PLACE_INFORMATION_REPORT_STATUSES)[number];

export interface PlaceInformationReport {
  reportId: string;
  placeName: string;
  providerIds: ProviderPlaceId[];
  reportType: PlaceInformationReportType;
  details: string;
  observedAt: string;
  createdAt: string;
  status: PlaceInformationReportStatus;
}

export interface PlaceInformationAdminReview {
  reportId: string;
  decision: "approve" | "reject";
  reviewedAt: string;
  reviewNote: string;
  evidenceChecked: boolean;
  resultingStatus: "approved" | "rejected";
}

export interface ReviewedPlaceInformationReport {
  report: PlaceInformationReport;
  review: PlaceInformationAdminReview;
  createsPetAccessVerdict: false;
}
