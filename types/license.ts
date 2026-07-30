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
