import "server-only";

import type { LocalDataItem } from "@/lib/licenses/schemas";
import type {
  LicenseOperatingState,
  LocalDataDataset,
  LocalDataLicenseRecord,
} from "@/types/license";

const PROVIDER = "Ministry of the Interior and Safety" as const;

function value(item: LocalDataItem, ...keys: string[]): string | null {
  for (const key of keys) {
    const candidate = item[key];
    if (candidate === undefined || candidate === null) continue;
    const text = String(candidate).normalize("NFKC").replace(/\s+/gu, " ").trim();
    if (text) return text;
  }
  return null;
}

export function normalizeOperatingState(item: LocalDataItem): LicenseOperatingState {
  const status = [
    value(item, "SALS_STTS_NM", "salsSttsNm"),
    value(item, "DTL_SALS_STTS_NM", "dtlSalsSttsNm"),
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]/gu, "");
  if (/폐업|폐쇄/u.test(status)) return "closed";
  if (/휴업|영업정지|정지/u.test(status)) return "suspended";
  if (/^(영업|정상|영업정상|정상영업|영업중)$/u.test(status)) return "active";
  return "unknown";
}

export function normalizeLocalDataRecord(
  item: LocalDataItem,
  context: { dataset: LocalDataDataset; retrievedAt: string },
): LocalDataLicenseRecord {
  const providerUpdatedAt = value(item, "DAT_UPDT_PNT", "LAST_MDFCN_PNT", "datUpdtPnt");
  const roadPostalCode = value(item, "ROAD_NM_ZIP", "roadNmZip");
  const parcelPostalCode = value(item, "LCTN_ZIP", "lctnZip");
  const sourceEvidence = {
    managementNumber: value(item, "MNG_NO", "mngNo"),
    businessName: value(item, "BPLC_NM", "bplcNm", "businessName"),
    roadAddress: value(item, "ROAD_NM_ADDR", "roadNmAddr", "roadAddress"),
    parcelAddress: value(item, "LOTNO_ADDR", "lotnoAddr", "parcelAddress"),
    roadPostalCode,
    parcelPostalCode,
    licensingDate: value(item, "LCPMT_YMD", "lcpmtYmd", "licensingDate"),
    businessStatusCode: value(item, "SALS_STTS_CD", "salsSttsCd"),
    businessStatusName: value(item, "SALS_STTS_NM", "salsSttsNm"),
    detailedStatusCode: value(item, "DTL_SALS_STTS_CD", "dtlSalsSttsCd"),
    detailedStatusName: value(item, "DTL_SALS_STTS_NM", "dtlSalsSttsNm"),
    closureDate: value(item, "CLSBIZ_YMD", "clsbizYmd"),
    suspensionStartDate: value(
      item,
      "SUSPN_BGNG_YMD",
      "suspensionStartDate",
    ),
    suspensionEndDate: value(item, "SUSPN_END_YMD", "suspensionEndDate"),
    reopeningDate: value(item, "RSMPTN_YMD", "reopeningDate"),
    phoneNumber: value(item, "TELNO", "telno", "phoneNumber"),
    localGovernmentCode: value(item, "OPN_ATMY_GRP_CD", "opnAtmyGrpCd"),
    businessCategory: value(
      item,
      "SNTTN_BZSTAT_NM",
      "CULTR_BZMN_SE_NM",
      "snttnBzstatNm",
    ),
    businessSubtype: value(
      item,
      "TOUR_LDGBIZ_DTL_NM",
      "CULTR_SPTS_TPBIZ_NM",
      "BZSTAT_SE_NM",
      "businessSubtype",
    ),
    roomCount: value(item, "KSRM_CNT", "GSRM_CNT", "roomCount"),
    facilityArea: value(item, "LCTN_AREA", "ARCH_TFA", "facilityArea"),
    providerUpdatedAt,
  };
  return {
    dataset: context.dataset,
    businessName: sourceEvidence.businessName,
    roadAddress: sourceEvidence.roadAddress,
    parcelAddress: sourceEvidence.parcelAddress,
    postalCode: roadPostalCode ?? parcelPostalCode,
    licensingDate: sourceEvidence.licensingDate,
    businessStatusCode: sourceEvidence.businessStatusCode,
    businessStatusName: sourceEvidence.businessStatusName,
    detailedStatusCode: sourceEvidence.detailedStatusCode,
    detailedStatusName: sourceEvidence.detailedStatusName,
    closureDate: sourceEvidence.closureDate,
    suspensionStartDate: sourceEvidence.suspensionStartDate,
    suspensionEndDate: sourceEvidence.suspensionEndDate,
    reopeningDate: sourceEvidence.reopeningDate,
    phoneNumber: sourceEvidence.phoneNumber,
    localGovernmentCode: sourceEvidence.localGovernmentCode,
    businessCategory: sourceEvidence.businessCategory,
    businessSubtype: sourceEvidence.businessSubtype,
    roomCount: sourceEvidence.roomCount,
    facilityArea: sourceEvidence.facilityArea,
    providerUpdatedAt,
    operatingState: normalizeOperatingState(item),
    source: {
      provider: PROVIDER,
      dataset: context.dataset,
      operation: "info",
      retrievedAt: context.retrievedAt,
      providerUpdatedAt,
    },
    sourceEvidence,
  };
}

export function normalizeLocalDataRecords(
  items: LocalDataItem[],
  context: { dataset: LocalDataDataset; retrievedAt: string },
): LocalDataLicenseRecord[] {
  return items.map((item) => normalizeLocalDataRecord(item, context));
}
