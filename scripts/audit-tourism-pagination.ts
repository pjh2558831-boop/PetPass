import { existsSync } from "node:fs";
import { TourApiClient } from "@/lib/tour-api/client";
import { normalizeTourPlaceSummaries } from "@/lib/tour-api/normalizers";
import type { TourItem } from "@/lib/tour-api/schemas";
import type { TourContentTypeId, TourPlaceSummary } from "@/types/place";

const PAGE_SIZE = 50;
const MAX_PAGES_PER_QUERY = 20;
const MAX_PROVIDER_CALLS = 160;
const SOUTH_KOREA_BOUNDS = {
  minLatitude: 32.5,
  maxLatitude: 39.5,
  minLongitude: 123,
  maxLongitude: 132.5,
} as const;

const CONTENT_TYPES = ["12", "14", "15", "28", "32", "38", "39"] as const;
const SCOPES = [
  { id: "busan", regionCode: "26" },
  { id: "haeundae", regionCode: "26", districtCode: "350" },
  { id: "suyeong", regionCode: "26", districtCode: "500" },
  { id: "seoul", regionCode: "11" },
  { id: "jeju", regionCode: "50" },
] as const;

if (!process.env.TOUR_API_SERVICE_KEY && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

interface PageAudit {
  items: TourItem[];
  totalCount: number;
  pagesFetched: number;
  providerRows: number;
  complete: boolean;
}

function text(item: TourItem, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function numeric(item: TourItem, key: string): number | null {
  const value = Number(text(item, key));
  return Number.isFinite(value) ? value : null;
}

function inSouthKorea(longitude: number, latitude: number): boolean {
  return (
    latitude >= SOUTH_KOREA_BOUNDS.minLatitude &&
    latitude <= SOUTH_KOREA_BOUNDS.maxLatitude &&
    longitude >= SOUTH_KOREA_BOUNDS.minLongitude &&
    longitude <= SOUTH_KOREA_BOUNDS.maxLongitude
  );
}

async function main() {
  if (process.env.CI) throw new Error("LIVE_AUDIT_DISABLED_IN_CI");
  const client = new TourApiClient({ transientRetryCount: 0, timeoutMs: 10_000 });
  let providerCalls = 0;

  async function fetchAll(params: Record<string, string>): Promise<PageAudit> {
    const items: TourItem[] = [];
    let totalCount = 0;
    let pagesFetched = 0;
    let previousPageSignature = "";

    for (let pageNo = 1; pageNo <= MAX_PAGES_PER_QUERY; pageNo += 1) {
      if (providerCalls >= MAX_PROVIDER_CALLS) {
        throw new Error("PROVIDER_CALL_LIMIT_REACHED");
      }
      providerCalls += 1;
      const response = await client.request("areaBasedList2", {
        ...params,
        pageNo: String(pageNo),
        numOfRows: String(PAGE_SIZE),
        arrange: "A",
      });
      pagesFetched += 1;
      if (pageNo === 1) totalCount = response.totalCount;
      const signature = response.items
        .map((item) => text(item, "contentid") ?? "missing")
        .join("|");
      if (pageNo > 1 && signature && signature === previousPageSignature) {
        throw new Error("REPEATED_PROVIDER_PAGE");
      }
      previousPageSignature = signature;
      items.push(...response.items);
      if (items.length >= totalCount || response.items.length === 0) break;
    }

    return {
      items,
      totalCount,
      pagesFetched,
      providerRows: items.length,
      complete: items.length >= totalCount,
    };
  }

  function summarize(
    audit: PageAudit,
    regionCode: string,
    districtCode?: string,
    fallbackContentTypeId?: TourContentTypeId,
  ) {
    const normalized = normalizeTourPlaceSummaries(audit.items, {
      operation: "areaBasedList2",
      retrievedAt: new Date().toISOString(),
      fallbackContentTypeId,
    });
    const ids = normalized.map((place) => place.contentId);
    const uniqueIds = new Set(ids);
    const validCoordinates = normalized.filter(
      (place) => place.longitude !== null && place.latitude !== null,
    );
    const rawCoordinatePairs = audit.items.map((item) => ({
      longitude: numeric(item, "mapx"),
      latitude: numeric(item, "mapy"),
    }));
    const coordinateCounts = new Map<string, number>();
    for (const place of validCoordinates) {
      const key = `${place.longitude?.toFixed(6)},${place.latitude?.toFixed(6)}`;
      coordinateCounts.set(key, (coordinateCounts.get(key) ?? 0) + 1);
    }
    return {
      totalCount: audit.totalCount,
      pagesFetched: audit.pagesFetched,
      providerRows: audit.providerRows,
      complete: audit.complete,
      parsed: audit.items.length,
      normalized: normalized.length,
      uniqueIds: uniqueIds.size,
      duplicateIds: ids.length - uniqueIds.size,
      validCoordinates: validCoordinates.length,
      missingCoordinates: rawCoordinatePairs.filter(
        ({ longitude, latitude }) => longitude === null || latitude === null,
      ).length,
      zeroCoordinates: rawCoordinatePairs.filter(
        ({ longitude, latitude }) => longitude === 0 || latitude === 0,
      ).length,
      reversedCoordinates: rawCoordinatePairs.filter(
        ({ longitude, latitude }) =>
          longitude !== null &&
          latitude !== null &&
          longitude >= SOUTH_KOREA_BOUNDS.minLatitude &&
          longitude <= SOUTH_KOREA_BOUNDS.maxLatitude &&
          latitude >= SOUTH_KOREA_BOUNDS.minLongitude &&
          latitude <= SOUTH_KOREA_BOUNDS.maxLongitude,
      ).length,
      outsideSouthKorea: validCoordinates.filter(
        (place) => !inSouthKorea(place.longitude!, place.latitude!),
      ).length,
      outsideRequestedRegion: normalized.filter(
        (place) => place.legalRegionCode !== null && place.legalRegionCode !== regionCode,
      ).length,
      outsideRequestedDistrict: districtCode
        ? normalized.filter(
            (place) =>
              place.legalDistrictCode !== null && place.legalDistrictCode !== districtCode,
          ).length
        : 0,
      duplicateCoordinateRecords: [...coordinateCounts.values()].reduce(
        (sum, count) => sum + Math.max(0, count - 1),
        0,
      ),
      summaries: normalized,
    };
  }

  const currentFirstPage = await (async () => {
    providerCalls += 1;
    const response = await client.request("areaBasedList2", {
      lDongRegnCd: "26",
      pageNo: "1",
      numOfRows: "20",
      arrange: "A",
    });
    return {
      totalCount: response.totalCount,
      numOfRows: response.numOfRows,
      pageNo: response.pageNo,
      returnedItems: response.items.length,
      parsedItems: normalizeTourPlaceSummaries(response.items, {
        operation: "areaBasedList2",
        retrievedAt: new Date().toISOString(),
      }).length,
    };
  })();
  console.log(`TOURISM_AUDIT_FIRST_PAGE=${JSON.stringify(currentFirstPage)}`);

  const busanByType = new Map<TourContentTypeId, ReturnType<typeof summarize>>();
  for (const scope of SCOPES) {
    const districtCode = "districtCode" in scope ? scope.districtCode : undefined;
    const scopeTotals: Record<string, number> = {};
    for (const contentTypeId of CONTENT_TYPES) {
      const audit = await fetchAll({
        lDongRegnCd: scope.regionCode,
        ...(districtCode ? { lDongSignguCd: districtCode } : {}),
        contentTypeId,
      });
      const summary = summarize(
        audit,
        scope.regionCode,
        districtCode,
        contentTypeId,
      );
      scopeTotals[contentTypeId] = summary.totalCount;
      if (scope.id === "busan") busanByType.set(contentTypeId, summary);
      console.log(
        `TOURISM_AUDIT_SCOPE_TYPE=${JSON.stringify({
          scope: scope.id,
          regionCode: scope.regionCode,
          districtCode: districtCode ?? null,
          contentTypeId,
          ...Object.fromEntries(
            Object.entries(summary).filter(([key]) => key !== "summaries"),
          ),
        })}`,
      );
    }
    console.log(
      `TOURISM_AUDIT_SCOPE_TOTAL=${JSON.stringify({
        scope: scope.id,
        byContentType: scopeTotals,
        total: Object.values(scopeTotals).reduce((sum, count) => sum + count, 0),
      })}`,
    );
  }

  const busanAll = [...busanByType.values()].flatMap(({ summaries }) => summaries);
  const uniqueBusan = new Map<string, TourPlaceSummary>();
  for (const place of busanAll) uniqueBusan.set(place.contentId, place);
  const defaultTypes = new Set(["12", "14", "15", "28", "32", "39"]);
  const defaultCatalog = [...uniqueBusan.values()].filter((place) =>
    place.contentTypeId ? defaultTypes.has(place.contentTypeId) : false,
  );
  console.log(
    `TOURISM_AUDIT_BUSAN_FUNNEL=${JSON.stringify({
      providerTypedTotal: busanAll.length,
      uniqueIds: uniqueBusan.size,
      duplicateIds: busanAll.length - uniqueBusan.size,
      validCoordinates: [...uniqueBusan.values()].filter(
        (place) => place.longitude !== null && place.latitude !== null,
      ).length,
      supportedContentTypes: [...uniqueBusan.values()].filter(
        (place) => place.contentTypeId !== null,
      ).length,
      defaultCatalogTotal: defaultCatalog.length,
      defaultCatalogFirstUiPage: Math.min(12, defaultCatalog.length),
      defaultCatalogFirstUiPageMarkers: defaultCatalog
        .slice()
        .sort(
          (left, right) =>
            (left.title ?? "").localeCompare(right.title ?? "", "ko") ||
            left.contentId.localeCompare(right.contentId),
        )
        .slice(0, 12)
        .filter((place) => place.longitude !== null && place.latitude !== null).length,
    })}`,
  );
  console.log(`TOURISM_AUDIT_PROVIDER_CALLS=${providerCalls}`);
  console.log("TOURISM_AUDIT_STATUS=success");
}

main().catch((error: unknown) => {
  const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  console.error(`TOURISM_AUDIT_STATUS=failed:${code.slice(0, 120)}`);
  process.exitCode = 1;
});
