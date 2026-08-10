import type {
  PlaceSourceConflict,
  PlaceSourceRecord,
  ProviderLinkAssessment,
  ProviderPlaceId,
} from "@/types/place-source";

function normalizedText(value: string | null): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko")
    .replace(/\(주\)|주식회사/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function normalizedAddress(value: string | null): string {
  return normalizedText(
    value
      ?.replace(/^부산광역시\s*/u, "부산 ")
      .replace(/^서울특별시\s*/u, "서울 ") ?? null,
  );
}

function normalizedPhone(value: string | null): string {
  return (value ?? "").replace(/\D/gu, "");
}

function distanceMeters(
  left: PlaceSourceRecord["coordinates"],
  right: PlaceSourceRecord["coordinates"],
): number | null {
  if (!left || !right) return null;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const fromLatitude = radians(left.latitude);
  const toLatitude = radians(right.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(
    6_371_000 *
      2 *
      Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)),
  );
}

function deduplicateProviderIds(
  records: readonly PlaceSourceRecord[],
): ProviderPlaceId[] {
  const unique = new Map<string, ProviderPlaceId>();
  for (const record of records) {
    for (const providerId of record.providerIds) {
      unique.set(`${providerId.provider}:${providerId.id}`, providerId);
    }
  }
  return [...unique.values()];
}

export function assessProviderLink(
  left: PlaceSourceRecord,
  right: PlaceSourceRecord,
): ProviderLinkAssessment {
  const leftRoad = normalizedAddress(left.roadAddress);
  const rightRoad = normalizedAddress(right.roadAddress);
  const leftName = normalizedText(left.name);
  const rightName = normalizedText(right.name);
  const leftPhone = normalizedPhone(left.phone);
  const rightPhone = normalizedPhone(right.phone);
  const exactRoadAddress = Boolean(leftRoad && rightRoad && leftRoad === rightRoad);
  const exactName = Boolean(leftName && rightName && leftName === rightName);
  const exactPhone = Boolean(leftPhone && rightPhone && leftPhone === rightPhone);
  const coordinateDistanceMeters = distanceMeters(
    left.coordinates,
    right.coordinates,
  );
  const matchingProviderId = left.providerIds.some((leftId) =>
    right.providerIds.some(
      (rightId) =>
        leftId.provider === rightId.provider && leftId.id === rightId.id,
    ),
  );
  const near50 =
    coordinateDistanceMeters !== null && coordinateDistanceMeters <= 50;
  const near100 =
    coordinateDistanceMeters !== null && coordinateDistanceMeters <= 100;

  let classification: ProviderLinkAssessment["classification"] = "unmatched";
  if (
    matchingProviderId ||
    (exactRoadAddress && exactName) ||
    (exactPhone && (exactName || exactRoadAddress))
  ) {
    classification = "exact";
  } else if (
    (exactRoadAddress && (exactPhone || near50)) ||
    (exactName && (exactPhone || near50))
  ) {
    classification = "probable";
  } else if (
    exactRoadAddress ||
    exactName ||
    exactPhone ||
    (near100 && (exactRoadAddress || exactName || exactPhone))
  ) {
    classification = "possible";
  }

  const reasons: string[] = [];
  if (exactRoadAddress) reasons.push("정규화한 도로명 주소가 일치합니다.");
  if (exactName) reasons.push("정규화한 장소명이 일치합니다.");
  if (exactPhone) reasons.push("전화번호가 일치합니다.");
  if (near100) {
    reasons.push(`제공 좌표 간 거리가 ${coordinateDistanceMeters}m입니다.`);
  }
  if (matchingProviderId) reasons.push("같은 제공자 ID가 보존되어 있습니다.");

  const conflicts: PlaceSourceConflict[] = [
    ...left.conflicts,
    ...right.conflicts,
  ];
  if (leftRoad && rightRoad && !exactRoadAddress && (exactName || exactPhone)) {
    conflicts.push({
      code: "address_conflict",
      summary: "장소 식별 근거는 있으나 제공자 도로명 주소가 서로 다릅니다.",
    });
  }
  if (
    coordinateDistanceMeters !== null &&
    coordinateDistanceMeters > 100 &&
    (exactRoadAddress || exactName || exactPhone)
  ) {
    conflicts.push({
      code: "coordinate_conflict",
      summary: `장소 식별 근거는 있으나 제공 좌표가 ${coordinateDistanceMeters}m 떨어져 있습니다.`,
    });
  }

  return {
    classification,
    sourceRecordIds: [left.recordId, right.recordId],
    providerIds: deduplicateProviderIds([left, right]),
    reasons,
    conflicts,
    components: {
      exactRoadAddress,
      exactName,
      exactPhone,
      coordinateDistanceMeters,
      matchingProviderId,
    },
    requiresReview:
      classification === "probable" ||
      classification === "possible" ||
      conflicts.length > 0,
  };
}

export function findBestProviderLink(
  candidate: PlaceSourceRecord,
  existingRecords: readonly PlaceSourceRecord[],
): ProviderLinkAssessment | null {
  const rank = { exact: 3, probable: 2, possible: 1, unmatched: 0 } as const;
  let best: ProviderLinkAssessment | null = null;
  for (const existing of existingRecords) {
    const assessment = assessProviderLink(existing, candidate);
    if (!best || rank[assessment.classification] > rank[best.classification]) {
      best = assessment;
    }
  }
  return best?.classification === "unmatched" ? null : best;
}
