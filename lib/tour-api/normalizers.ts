import "server-only";

import {
  INTRO_PET_FIELD_BY_CONTENT_TYPE,
  PET_ACCESS_LIMITS,
} from "@/lib/pet-access/tourism/constants";
import type { TourItem } from "@/lib/tour-api/schemas";
import {
  TOUR_CONTENT_TYPE_IDS,
  type Coordinates,
  type TourContentTypeId,
  type TourIntroPetPolicyEvidence,
  type TourOperationName,
  type TourPetPolicyEvidence,
  type TourPetPolicyFields,
  type TourPlaceCategory,
  type TourPlaceSummary,
} from "@/types/place";

const CONTENT_TYPE_CATEGORIES: Record<TourContentTypeId, TourPlaceCategory> = {
  "12": "attraction",
  "14": "culture",
  "15": "festival",
  "28": "leisure",
  "32": "accommodation",
  "38": "shopping",
  "39": "food",
};

const TOUR_PROVIDER = "Korea Tourism Organization" as const;

function value(item: TourItem, ...keys: string[]): string | null {
  for (const key of keys) {
    const candidate = item[key];
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
  }
  return null;
}

function decodeBasicEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function sanitizeProviderText(input: string | null | undefined): string | null {
  if (!input) return null;
  const sanitized = decodeBasicEntities(
    input
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return sanitized || null;
}

export function extractSafeHomepageUrl(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  const decoded = decodeBasicEntities(input);
  const href = decoded.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
  const plainUrl = decoded.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
  const candidate = href ?? plainUrl;
  if (!candidate) return null;
  try {
    const url = new URL(candidate.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function normalizeImageUrl(input: string | null): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function normalizeCoordinate(
  input: string | null,
  minimum: number,
  maximum: number,
): number | null {
  if (!input) return null;
  const parsed = Number(input);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

export function normalizeTourContentTypeId(
  input: string | null | undefined,
): TourContentTypeId | null {
  const normalized = input?.trim();
  return TOUR_CONTENT_TYPE_IDS.includes(normalized as TourContentTypeId)
    ? (normalized as TourContentTypeId)
    : null;
}

export function normalizeTourCategory(
  input: string | null | undefined,
): TourPlaceCategory {
  const contentTypeId = normalizeTourContentTypeId(input);
  return contentTypeId ? CONTENT_TYPE_CATEGORIES[contentTypeId] : "unknown";
}

export function normalizeCoordinates(item: TourItem): Coordinates | null {
  const longitude = normalizeCoordinate(value(item, "mapx"), -180, 180);
  const latitude = normalizeCoordinate(value(item, "mapy"), -90, 90);
  return longitude === null || latitude === null
    ? null
    : { longitude, latitude };
}

export function normalizeTourPlaceSummary(
  item: TourItem,
  context: {
    operation: TourOperationName;
    retrievedAt: string;
    fallbackContentId?: string;
    fallbackContentTypeId?: TourContentTypeId | null;
  },
): TourPlaceSummary | null {
  const contentId = value(item, "contentid") ?? context.fallbackContentId ?? null;
  if (!contentId) return null;
  const providerContentTypeId = value(item, "contenttypeid");
  const normalizedProviderContentTypeId = normalizeTourContentTypeId(
    providerContentTypeId,
  );
  const contentTypeId =
    normalizedProviderContentTypeId ??
    (providerContentTypeId === null ? context.fallbackContentTypeId ?? null : null);
  const coordinates = normalizeCoordinates(item);
  const modifiedTime = value(item, "modifiedtime");

  return {
    contentId,
    contentTypeId,
    providerContentTypeId,
    category: normalizeTourCategory(contentTypeId),
    title: sanitizeProviderText(value(item, "title")),
    address: sanitizeProviderText(value(item, "addr1")),
    detailAddress: sanitizeProviderText(value(item, "addr2")),
    longitude: coordinates?.longitude ?? null,
    latitude: coordinates?.latitude ?? null,
    phone: sanitizeProviderText(value(item, "tel")),
    thumbnailUrl: normalizeImageUrl(value(item, "firstimage2")),
    imageUrl: normalizeImageUrl(value(item, "firstimage")),
    copyrightType: value(item, "cpyrhtDivCd"),
    createdTime: value(item, "createdtime"),
    modifiedTime,
    legalRegionCode: value(item, "lDongRegnCd", "ldongregncd"),
    legalDistrictCode: value(
      item,
      "lDongSignguCd",
      "ldongsigngucd",
    ),
    areaCode: value(item, "areacode", "areaCode"),
    sigunguCode: value(item, "sigungucode", "sigunguCode"),
    classificationCodes: {
      primary: value(item, "cat1"),
      secondary: value(item, "cat2"),
      tertiary: value(item, "cat3"),
      largeCategory: value(item, "lclsSystm1", "lclssystm1"),
      middleCategory: value(item, "lclsSystm2", "lclssystm2"),
      smallCategory: value(item, "lclsSystm3", "lclssystm3"),
    },
    source: {
      provider: TOUR_PROVIDER,
      operation: context.operation,
      retrievedAt: context.retrievedAt,
      contentId,
      providerModifiedTime: modifiedTime,
    },
  };
}

export function normalizeTourPlaceSummaries(
  items: TourItem[],
  context: {
    operation: TourOperationName;
    retrievedAt: string;
    fallbackContentTypeId?: TourContentTypeId | null;
  },
): TourPlaceSummary[] {
  return items
    .map((item) => normalizeTourPlaceSummary(item, context))
    .filter((item): item is TourPlaceSummary => item !== null);
}

export interface NormalizedTourIntroDetails {
  operatingInformation: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  restDayInformation: string | null;
  parkingInformation: string | null;
  reservationInformation: string | null;
  contactInformation: string | null;
}

function firstText(item: TourItem | null, keys: string[]): string | null {
  if (!item) return null;
  return sanitizeProviderText(value(item, ...keys));
}

function boundedProviderText(input: string | null | undefined): string | null {
  const sanitized = sanitizeProviderText(input);
  return sanitized
    ? Array.from(sanitized).slice(0, PET_ACCESS_LIMITS.sourceFieldCharacters).join("")
    : null;
}

export function normalizeTourIntroDetails(
  item: TourItem | null,
): NormalizedTourIntroDetails {
  return {
    operatingInformation: firstText(item, [
      "usetime",
      "usetimeculture",
      "usetimeleports",
      "opentime",
      "opentimefood",
      "playtime",
    ]),
    checkInTime: firstText(item, ["checkintime"]),
    checkOutTime: firstText(item, ["checkouttime"]),
    restDayInformation: firstText(item, [
      "restdate",
      "restdateculture",
      "restdateleports",
      "restdateshopping",
      "restdatefood",
    ]),
    parkingInformation: firstText(item, [
      "parking",
      "parkingculture",
      "parkingleports",
      "parkingshopping",
      "parkinglodging",
      "parkingfood",
    ]),
    reservationInformation: firstText(item, [
      "reservation",
      "reservationlodging",
      "reservationfood",
      "reservationurl",
    ]),
    contactInformation: firstText(item, [
      "infocenter",
      "infocenterculture",
      "infocenterleports",
      "infocentershopping",
      "infocenterlodging",
      "infocenterfood",
      "sponsor1tel",
      "tel",
    ]),
  };
}

export function normalizePetPolicyEvidence(
  item: TourItem | null,
  context: { contentId: string; retrievedAt: string },
): TourPetPolicyEvidence | null {
  if (!item) return null;
  const fields: TourPetPolicyFields = {
    acmpyTypeCd: boundedProviderText(value(item, "acmpyTypeCd")),
    acmpyPsblCpam: boundedProviderText(value(item, "acmpyPsblCpam")),
    acmpyNeedMtr: boundedProviderText(value(item, "acmpyNeedMtr")),
    etcAcmpyInfo: boundedProviderText(value(item, "etcAcmpyInfo")),
    relaAcdntRiskMtr: boundedProviderText(value(item, "relaAcdntRiskMtr")),
    relaPosesFclty: boundedProviderText(value(item, "relaPosesFclty")),
    relaFrnshPrdlst: boundedProviderText(value(item, "relaFrnshPrdlst")),
    relaPurcPrdlst: boundedProviderText(value(item, "relaPurcPrdlst")),
    relaRntlPrdlst: boundedProviderText(value(item, "relaRntlPrdlst")),
  };
  const providerModifiedTime = value(item, "modifiedtime");
  return {
    fields,
    sourceEvidence: {
      provider: TOUR_PROVIDER,
      operation: "detailPetTour2",
      contentId: context.contentId,
      providerModifiedTime,
      retrievedAt: context.retrievedAt,
      originalEvidenceFields: { ...fields },
    },
  };
}

export function normalizeIntroPetPolicyEvidence(
  item: TourItem | null,
  providerContentTypeId: TourContentTypeId | null,
  context: { contentId: string; retrievedAt: string },
): TourIntroPetPolicyEvidence | null {
  if (!item || !providerContentTypeId) return null;
  const field = INTRO_PET_FIELD_BY_CONTENT_TYPE[providerContentTypeId];
  if (!field) return null;
  const normalizedValue = boundedProviderText(value(item, field));
  if (!normalizedValue) return null;
  const providerModifiedTime = value(item, "modifiedtime");
  return {
    field,
    value: normalizedValue,
    sourceEvidence: {
      provider: TOUR_PROVIDER,
      operation: "detailIntro2",
      contentId: context.contentId,
      retrievedAt: context.retrievedAt,
      providerModifiedTime,
      originalValue: normalizedValue,
    },
  };
}

export function getTourProviderName(): typeof TOUR_PROVIDER {
  return TOUR_PROVIDER;
}
