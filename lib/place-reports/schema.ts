import { z } from "zod";
import {
  PLACE_INFORMATION_REPORT_STATUSES,
  PLACE_INFORMATION_REPORT_TYPES,
  type PlaceInformationReport,
  type ReviewedPlaceInformationReport,
} from "@/types/place-report";

const providerPlaceIdSchema = z
  .object({
    provider: z.string().trim().min(1).max(100),
    id: z.string().trim().min(1).max(100),
  })
  .strict();

export const placeInformationReportSchema = z
  .object({
    reportId: z.string().trim().min(1).max(100),
    placeName: z.string().trim().min(1).max(120),
    providerIds: z.array(providerPlaceIdSchema).min(1).max(10),
    reportType: z.enum(PLACE_INFORMATION_REPORT_TYPES),
    details: z.string().trim().min(20).max(2_000),
    observedAt: z.string().datetime(),
    createdAt: z.string().datetime(),
    status: z.enum(PLACE_INFORMATION_REPORT_STATUSES),
  })
  .strict();

export const adminReviewSchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    reviewedAt: z.string().datetime(),
    reviewNote: z.string().trim().min(10).max(2_000),
    evidenceChecked: z.boolean(),
  })
  .strict();

export function applyAdminReview(
  input: PlaceInformationReport,
  reviewInput: z.input<typeof adminReviewSchema>,
): ReviewedPlaceInformationReport {
  const report = placeInformationReportSchema.parse(input);
  const review = adminReviewSchema.parse(reviewInput);
  if (report.status !== "pending_review" && report.status !== "in_review") {
    throw new Error("검토 대기 또는 검토 중인 제보만 결정할 수 있습니다.");
  }
  if (review.decision === "approve" && !review.evidenceChecked) {
    throw new Error("승인하려면 확인한 근거를 기록해야 합니다.");
  }
  const resultingStatus =
    review.decision === "approve" ? "approved" : "rejected";
  return {
    report: { ...report, status: resultingStatus },
    review: {
      reportId: report.reportId,
      ...review,
      resultingStatus,
    },
    // Approval makes a reviewed report; it never creates a pet-access verdict.
    createsPetAccessVerdict: false,
  };
}
