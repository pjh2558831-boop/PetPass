import type {
  AccommodationEntityCandidate,
  LicenseMatchCandidate,
  LicenseScoreComponents,
  LocalDataLicenseRecord,
} from "@/types/license";

const CORPORATE_FORMS =
  /(?:㈜|\(\s*주\s*\)|주식회사|\(\s*유\s*\)|유한회사|합자회사|합명회사)/giu;
const PUNCTUATION = /[^\p{L}\p{N}-]+/gu;
const COMMON_SHORT_NAMES = new Set([
  "카페",
  "식당",
  "커피",
  "분식",
  "횟집",
  "치킨",
  "김밥",
]);
const GENERIC_ACCOMMODATION_WORDS = new Set([
  "호텔",
  "모텔",
  "펜션",
  "리조트",
  "숙소",
  "게스트하우스",
  "hotel",
  "motel",
  "pension",
  "resort",
]);
const COMMON_PROPERTY_NAMES = new Set([
  "센트럴",
  "그랜드",
  "로얄",
  "오션",
  "파크",
  "시티",
  "central",
  "grand",
  "royal",
  "ocean",
  "park",
  "city",
]);

export interface NormalizedName {
  canonical: string;
  tokens: string[];
  branchTokens: string[];
  commonOrShort: boolean;
}

export interface NormalizedAddress {
  canonical: string;
  roadName: string | null;
  buildingNumber: string | null;
  district: string | null;
  neighborhood: string | null;
  parcelNumber: string | null;
  postalCode: string | null;
}

export interface LicenseMatchTarget {
  businessName: string;
  address: string;
  postalCode?: string | null;
  domain?: "food" | "accommodation";
}

function normalizedWords(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(CORPORATE_FORMS, " ")
    .replace(PUNCTUATION, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

export function normalizeBusinessName(value: string): NormalizedName {
  const tokens = normalizedWords(value);
  const canonical = tokens.join("");
  const branchTokens = tokens.filter(
    (token) =>
      token === "본점" ||
      token === "지점" ||
      (token.length >= 3 && token.endsWith("점")),
  );
  return {
    canonical,
    tokens,
    branchTokens,
    commonOrShort: canonical.length < 4 || COMMON_SHORT_NAMES.has(canonical),
  };
}

export function normalizeBusinessText(value: string): string {
  return normalizeBusinessName(value).canonical;
}

export function normalizeAddress(
  value: string,
  postalCode: string | null = null,
): NormalizedAddress {
  const normalized = value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/부산광역시/gu, "부산")
    .replace(/서울특별시/gu, "서울")
    .replace(PUNCTUATION, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const compact = normalized.replace(/\s+/gu, "");
  const road = normalized.match(
    /([가-힣a-z0-9]+(?:대로|로|길))\s*(\d+(?:-\d+)?)/u,
  );
  const district =
    normalized.match(/(?:^|\s)([가-힣]+(?:구|군))(?:\s|$)/u)?.[1] ?? null;
  const neighborhood =
    normalized.match(/(?:^|\s)([가-힣0-9]+(?:동|읍|면|리))(?:\s|$)/u)?.[1] ??
    null;
  const parcelNumber = road
    ? null
    : normalized.match(/(?:동|읍|면|리)\s*(\d+(?:-\d+)?)/u)?.[1] ?? null;
  return {
    canonical: compact,
    roadName: road?.[1] ?? null,
    buildingNumber: road?.[2] ?? null,
    district,
    neighborhood,
    parcelNumber,
    postalCode: postalCode?.replace(/[^0-9]/gu, "") || null,
  };
}

function bigrams(value: string): Set<string> {
  const result = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) {
    result.add(value.slice(index, index + 2));
  }
  return result;
}

function diceSimilarity(left: string, right: string): number {
  if (left === right && left.length > 0) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  const overlap = [...leftBigrams].filter((value) => rightBigrams.has(value)).length;
  return (2 * overlap) / (leftBigrams.size + rightBigrams.size);
}

function tokenOverlap(left: string[], right: string[]): number {
  const leftSet = new Set(left.filter((token) => token.length > 1));
  const rightSet = new Set(right.filter((token) => token.length > 1));
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  const overlap = [...leftSet].filter((value) => rightSet.has(value)).length;
  return overlap / Math.max(leftSet.size, rightSet.size);
}

function agreement(
  left: string | null,
  right: string | null,
): "agree" | "conflict" | "unknown" {
  if (!left || !right) return "unknown";
  return left === right ? "agree" : "conflict";
}

function branchAgreement(
  left: NormalizedName,
  right: NormalizedName,
): "agree" | "conflict" | "unknown" {
  if (left.branchTokens.length === 0 || right.branchTokens.length === 0) {
    return "unknown";
  }
  return left.branchTokens.some((token) => right.branchTokens.includes(token))
    ? "agree"
    : "conflict";
}

function accommodationTypes(value: string): Set<string> {
  const canonical = normalizeBusinessText(value);
  return new Set(
    [...GENERIC_ACCOMMODATION_WORDS].filter((word) => canonical.includes(word)),
  );
}

function accommodationTypeAgreement(
  targetName: string,
  record: LocalDataLicenseRecord,
): "agree" | "conflict" | "unknown" {
  const targetTypes = accommodationTypes(targetName);
  const candidateTypes = accommodationTypes(
    [record.businessName, record.businessCategory, record.businessSubtype]
      .filter(Boolean)
      .join(" "),
  );
  if (targetTypes.size === 0 || candidateTypes.size === 0) return "unknown";
  return [...targetTypes].some((type) => candidateTypes.has(type))
    ? "agree"
    : "conflict";
}

export function isGenericAccommodationName(value: string): boolean {
  const canonical = normalizeBusinessText(value);
  if (!canonical) return true;
  if (GENERIC_ACCOMMODATION_WORDS.has(canonical)) return true;
  let propertyName = canonical;
  for (const word of GENERIC_ACCOMMODATION_WORDS) {
    propertyName = propertyName.replaceAll(word, "");
  }
  return propertyName.length < 3 || COMMON_PROPERTY_NAMES.has(propertyName);
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

export function scoreLicenseCandidate(
  target: LicenseMatchTarget,
  record: LocalDataLicenseRecord,
): LicenseMatchCandidate {
  const targetName = normalizeBusinessName(target.businessName);
  const candidateName = normalizeBusinessName(record.businessName ?? "");
  const exactName =
    targetName.canonical.length > 0 &&
    targetName.canonical === candidateName.canonical;
  const overlap = tokenOverlap(targetName.tokens, candidateName.tokens);
  const bigram = diceSimilarity(targetName.canonical, candidateName.canonical);
  const branch = branchAgreement(targetName, candidateName);
  const typeAgreement =
    target.domain === "accommodation"
      ? accommodationTypeAgreement(target.businessName, record)
      : "unknown";
  const genericAccommodationName =
    target.domain === "accommodation" &&
    isGenericAccommodationName(target.businessName);
  let nameScore = exactName ? 1 : 0.35 * overlap + 0.65 * bigram;
  if (branch === "agree") nameScore = Math.min(1, nameScore + 0.05);
  if (branch === "conflict") nameScore = Math.max(0, nameScore - 0.2);
  if (typeAgreement === "agree") nameScore = Math.min(1, nameScore + 0.03);
  if (typeAgreement === "conflict") nameScore = Math.max(0, nameScore - 0.18);

  const targetAddress = normalizeAddress(
    target.address,
    target.postalCode ?? null,
  );
  const candidateAddress = normalizeAddress(
    record.roadAddress ?? record.parcelAddress ?? "",
    record.postalCode,
  );
  const roadAgreement =
    Boolean(targetAddress.roadName) &&
    targetAddress.roadName === candidateAddress.roadName;
  const building = agreement(
    targetAddress.buildingNumber,
    candidateAddress.buildingNumber,
  );
  const districtAgreement =
    Boolean(targetAddress.district) &&
    targetAddress.district === candidateAddress.district;
  const neighborhoodAgreement =
    Boolean(targetAddress.neighborhood) &&
    targetAddress.neighborhood === candidateAddress.neighborhood;
  const parcel = agreement(
    targetAddress.parcelNumber,
    candidateAddress.parcelNumber,
  );
  const postalCodeAgreement =
    Boolean(targetAddress.postalCode) &&
    targetAddress.postalCode === candidateAddress.postalCode;

  let addressScore = 0;
  if (
    targetAddress.canonical.length >= 8 &&
    targetAddress.canonical === candidateAddress.canonical
  ) {
    addressScore = 1;
  } else {
    if (roadAgreement) addressScore += 0.35;
    if (building === "agree") addressScore += 0.3;
    if (parcel === "agree") addressScore += 0.3;
    if (districtAgreement) addressScore += 0.15;
    if (neighborhoodAgreement) addressScore += 0.1;
    if (postalCodeAgreement) addressScore += 0.1;
    addressScore = Math.min(1, addressScore);
  }

  let totalScore = 0.55 * nameScore + 0.45 * addressScore;
  if (building === "conflict" || parcel === "conflict") {
    totalScore = Math.min(totalScore, 0.7);
  }
  if (
    nameScore < 0.45 ||
    branch === "conflict" ||
    typeAgreement === "conflict"
  ) {
    totalScore = Math.min(totalScore, 0.71);
  }
  if (targetName.commonOrShort) totalScore = Math.min(totalScore, 0.71);
  if (genericAccommodationName) totalScore = Math.min(totalScore, 0.85);

  const reasons: string[] = [];
  if (exactName) reasons.push("업소명이 정확히 일치합니다.");
  else if (nameScore >= 0.55) {
    reasons.push("업소명에 의미 있는 유사성이 있습니다.");
  }
  if (roadAgreement) reasons.push("도로명이 일치합니다.");
  if (building === "agree") reasons.push("건물번호가 일치합니다.");
  if (building === "conflict") reasons.push("건물번호가 서로 다릅니다.");
  if (districtAgreement) reasons.push("구·군 정보가 일치합니다.");
  if (neighborhoodAgreement) reasons.push("동·읍·면 정보가 일치합니다.");
  if (parcel === "agree") reasons.push("지번이 일치합니다.");
  if (parcel === "conflict") reasons.push("지번이 서로 다릅니다.");
  if (branch === "conflict") reasons.push("지점명이 서로 다릅니다.");
  if (typeAgreement === "agree") reasons.push("숙박 유형 정보가 일치합니다.");
  if (typeAgreement === "conflict") reasons.push("숙박 유형 정보가 서로 다릅니다.");
  if (targetName.commonOrShort) {
    reasons.push("업소명이 짧거나 일반적이어서 보수적으로 판정했습니다.");
  }
  if (genericAccommodationName) {
    reasons.push("숙박시설명이 일반적이어서 고신뢰 판정을 제한했습니다.");
  }
  if (addressScore === 0) reasons.push("확인 가능한 주소 일치 근거가 없습니다.");

  const components: LicenseScoreComponents = {
    name: round(nameScore),
    address: round(addressScore),
    exactName,
    tokenOverlap: round(overlap),
    bigramSimilarity: round(bigram),
    branchAgreement: branch,
    accommodationTypeAgreement: typeAgreement,
    genericAccommodationName,
    roadAgreement,
    buildingNumberAgreement: building,
    districtAgreement,
    neighborhoodAgreement,
    parcelNumberAgreement: parcel,
    postalCodeAgreement,
  };
  return { record, totalScore: round(totalScore), reasons, components };
}

export function rankLicenseCandidates(
  target: LicenseMatchTarget,
  records: LocalDataLicenseRecord[],
): LicenseMatchCandidate[] {
  return records
    .map((record) => scoreLicenseCandidate(target, record))
    .sort((left, right) => right.totalScore - left.totalScore);
}

export function getRelaxedBusinessNameSegment(
  name: string,
  domain: "food" | "accommodation" = "food",
): string | null {
  const normalized = normalizeBusinessName(name);
  if (domain === "food") {
    const segment = [...normalized.tokens]
      .filter((token) => token.length >= 3 && !COMMON_SHORT_NAMES.has(token))
      .sort((left, right) => right.length - left.length)[0];
    if (!segment || segment === normalized.canonical || segment.length < 3) return null;
    return segment;
  }

  const meaningful = normalized.tokens
    .map((token) => {
      let candidate = token;
      for (const word of GENERIC_ACCOMMODATION_WORDS) {
        candidate = candidate.replaceAll(word, "");
      }
      return candidate;
    })
    .filter(
      (token) =>
        token.length >= 3 &&
        !GENERIC_ACCOMMODATION_WORDS.has(token) &&
        !COMMON_PROPERTY_NAMES.has(token),
    )
    .sort((left, right) => right.length - left.length)[0];
  if (!meaningful || meaningful === normalized.canonical) return null;
  return meaningful;
}

export function getPreciseRoadAddressCondition(address: string): string | null {
  const normalized = normalizeAddress(address);
  if (!normalized.roadName || !normalized.buildingNumber) return null;
  return `${normalized.roadName} ${normalized.buildingNumber}`;
}

function recordAddress(record: LocalDataLicenseRecord): string {
  return record.roadAddress ?? record.parcelAddress ?? "";
}

function recordsIdentifySameBusiness(
  left: LocalDataLicenseRecord,
  right: LocalDataLicenseRecord,
): boolean {
  const comparison = scoreLicenseCandidate(
    {
      businessName: left.businessName ?? "",
      address: recordAddress(left),
      postalCode: left.postalCode,
    },
    right,
  );
  return (
    comparison.totalScore >= 0.86 &&
    comparison.components.name >= 0.82 &&
    comparison.components.address >= 0.65 &&
    comparison.components.branchAgreement !== "conflict" &&
    comparison.components.buildingNumberAgreement !== "conflict" &&
    comparison.components.parcelNumberAgreement !== "conflict"
  );
}

export function clusterAccommodationCandidates(
  candidates: LicenseMatchCandidate[],
): AccommodationEntityCandidate[] {
  const clusters: LicenseMatchCandidate[][] = [];
  for (const candidate of candidates) {
    const cluster = clusters.find((existing) =>
      existing.some((member) =>
        recordsIdentifySameBusiness(member.record, candidate.record),
      ),
    );
    if (cluster) cluster.push(candidate);
    else clusters.push([candidate]);
  }

  return clusters
    .map((records) => {
      records.sort((left, right) => right.totalScore - left.totalScore);
      const states = new Set(records.map(({ record }) => record.operatingState));
      return {
        identity: {
          businessName: records[0]?.record.businessName ?? null,
          address: records[0] ? recordAddress(records[0].record) || null : null,
        },
        aggregateScore: records[0]?.totalScore ?? 0,
        records,
        reasons: [
          ...(records[0]?.reasons ?? []),
          ...(new Set(records.map(({ record }) => record.dataset)).size > 1
            ? ["동일 시설에 대한 복수 인허가 기록이 확인되었습니다."]
            : []),
        ],
        operatingStateDiscrepancy: states.size > 1,
      };
    })
    .sort((left, right) => right.aggregateScore - left.aggregateScore);
}

export function isPotentialLicenseMatch(
  target: { name: string; address: string },
  candidate: { name: string; address: string },
): boolean {
  const targetName = normalizeBusinessText(target.name);
  const candidateName = normalizeBusinessText(candidate.name);
  const targetAddress = normalizeAddress(target.address).canonical;
  const candidateAddress = normalizeAddress(candidate.address).canonical;
  return (
    targetName.length > 1 &&
    targetName === candidateName &&
    (targetAddress.includes(candidateAddress) ||
      candidateAddress.includes(targetAddress))
  );
}
