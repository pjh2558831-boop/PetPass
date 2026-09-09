import { expect, it } from "vitest";
import { reviewVenueMedia } from "@/lib/places/venue-media-review";

const entry = {
  placeId: "kakao:123", role: "venue_photo", sourceReference: "owner delivery 1",
  rightsholder: "합성 소유자", licenseReference: "synthetic permission 1", assetVersion: "photo-1",
  identityReview: "approved", rightsReview: "approved", reviewedBy: "local-operator",
  reviewedAt: "2026-09-01T00:00:00Z", attribution: "사진: 합성 소유자", permittedTransformations: ["none"],
  allowedUses: ["public_display", "storage", "hosting"], expiresAt: null, revokedAt: null,
  revocationConditions: "소유자 요청 시 중단", qualityReview: "approved",
};
it("requires identity, rights, quality, and current explicit use rights without publishing", () => {
  const now = new Date("2026-09-09T00:00:00Z");
  expect(reviewVenueMedia(entry, now).eligible).toBe(true);
  for (const field of ["identityReview", "rightsReview", "qualityReview"]) {
    expect(reviewVenueMedia({ ...entry, [field]: "pending" }, now).eligible).toBe(false);
  }
  expect(reviewVenueMedia({ ...entry, expiresAt: "2026-09-08T00:00:00Z" }, now).eligible).toBe(false);
  expect(reviewVenueMedia({ ...entry, revokedAt: "2026-09-08T00:00:00Z" }, now).eligible).toBe(false);
  expect(reviewVenueMedia({ ...entry, allowedUses: ["storage"] }, now).eligible).toBe(false);
  expect(reviewVenueMedia({ ...entry, licenseReference: "" }, now).eligible).toBe(false);
  expect(reviewVenueMedia({ ...entry, reviewedAt: "2027-01-01T00:00:00Z" }, now).eligible).toBe(false);
});
