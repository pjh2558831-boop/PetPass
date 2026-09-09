import { z } from "zod";

const text = z.string().trim().min(1).max(2000);
const status = z.enum(["pending", "approved", "rejected"]);
export const venueMediaEntrySchema = z.object({
  placeId: z.string().regex(/^(tour|kakao):[^\s:]+$/u),
  role: z.literal("venue_photo"),
  sourceReference: text,
  rightsholder: text,
  licenseReference: text,
  assetVersion: text,
  identityReview: status,
  rightsReview: status,
  qualityReview: status,
  reviewedBy: text,
  reviewedAt: z.string().datetime({ offset: true }),
  attribution: text,
  permittedTransformations: z.array(text).min(1).max(20),
  allowedUses: z.array(z.enum(["public_display", "storage", "hosting", "transformation"])).max(4),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  revokedAt: z.string().datetime({ offset: true }).nullable(),
  revocationConditions: text,
}).strict();

/** Local evidence checklist only; this neither authenticates evidence nor publishes an asset. */
export function reviewVenueMedia(input: unknown, now = new Date()) {
  const parsed = venueMediaEntrySchema.safeParse(input);
  if (!parsed.success) return { eligible: false, reasons: ["invalid_manifest"] };
  const entry = parsed.data;
  const reasons: string[] = [];
  for (const field of ["identityReview", "rightsReview", "qualityReview"] as const) {
    if (entry[field] !== "approved") reasons.push(`${field}_not_approved`);
  }
  if (!Number.isFinite(now.getTime()) || Date.parse(entry.reviewedAt) > now.getTime()) reasons.push("invalid_review_time");
  if (entry.expiresAt && Date.parse(entry.expiresAt) <= now.getTime()) reasons.push("expired");
  if (entry.revokedAt) reasons.push("revoked");
  if (!["public_display", "storage", "hosting"].every(use => entry.allowedUses.includes(use as "public_display" | "storage" | "hosting"))) reasons.push("missing_use_permission");
  if (entry.permittedTransformations.some(value => value !== "none") && !entry.allowedUses.includes("transformation")) reasons.push("missing_transformation_permission");
  return { eligible: reasons.length === 0, reasons };
}
