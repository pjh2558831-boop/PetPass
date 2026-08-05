import { existsSync } from "node:fs";
import {
  createTrustedTourPetAccessInput,
  evaluateTourPetAccess,
} from "@/lib/pet-access/tourism/evaluator";
import {
  buildTourRequestUrl,
  encodeServiceKeyExactlyOnce,
  TourApiClient,
} from "@/lib/tour-api/client";
import { getTourApiConfig } from "@/lib/tour-api/config";
import { parseTourResponse } from "@/lib/tour-api/parser";
import type { ParsedTourResponse, TourItem } from "@/lib/tour-api/schemas";
import { KoreaTourismService } from "@/lib/tour-api/service";

const MAX_PROVIDER_CALLS = 13;
const MAX_CANDIDATES = 3;
const PET_FIELDS = [
  "acmpyTypeCd",
  "acmpyPsblCpam",
  "acmpyNeedMtr",
  "etcAcmpyInfo",
  "relaAcdntRiskMtr",
  "relaPosesFclty",
  "relaFrnshPrdlst",
  "relaPurcPrdlst",
  "relaRntlPrdlst",
] as const;

type TraceFormat = "json" | "xml";
type ItemsShape =
  | "absent"
  | "empty_string"
  | "empty_object"
  | "item_array"
  | "single_item_object"
  | "xml_item_nodes"
  | "other";

interface TraceObservation {
  operation: string;
  format: TraceFormat;
  httpStatus: number | null;
  resultCode: string | null;
  resultMsg: string | null;
  itemsShape: ItemsShape;
  itemCount: number;
  topLevelFieldNames: string[];
  itemFieldNames: string[];
  nonEmptyPetFieldNames: string[];
  petPolicyValuePresent: boolean;
  parameterNames: string[];
  transport: "success" | "failure";
}

if (!process.env.TOUR_API_SERVICE_KEY && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

function safeProviderMessage(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value)
    .replace(/https?:\/\/\S+/giu, "[url omitted]")
    .replace(/\b(serviceKey|TOUR_API_SERVICE_KEY)\s*[:=]\s*[^\s&]+/giu, "$1=[omitted]")
    .replace(/[\r\n]+/gu, " ")
    .trim();
  return text ? Array.from(text).slice(0, 80).join("") : null;
}

function stringValue(item: TourItem | null, ...keys: string[]): string | null {
  if (!item) return null;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function hasPetPolicyValue(item: Record<string, unknown> | null): boolean {
  if (!item) return false;
  return PET_FIELDS.some((field) => {
    const value = item[field];
    return (typeof value === "string" || typeof value === "number") &&
      String(value).trim() !== "";
  });
}

function jsonObservation(
  operation: string,
  status: number,
  payload: string,
  parameterNames: string[],
): TraceObservation {
  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    return {
      operation,
      format: "json",
      httpStatus: status,
      resultCode: null,
      resultMsg: null,
      itemsShape: "other",
      itemCount: 0,
      topLevelFieldNames: [],
      itemFieldNames: [],
      nonEmptyPetFieldNames: [],
      petPolicyValuePresent: false,
      parameterNames,
      transport: "success",
    };
  }

  const root = json && typeof json === "object" && !Array.isArray(json)
    ? (json as Record<string, unknown>)
    : {};
  const response = root.response && typeof root.response === "object"
    ? (root.response as Record<string, unknown>)
    : {};
  const header = response.header && typeof response.header === "object"
    ? (response.header as Record<string, unknown>)
    : {};
  const body = response.body && typeof response.body === "object"
    ? (response.body as Record<string, unknown>)
    : {};
  const hasItems = Object.prototype.hasOwnProperty.call(body, "items");
  const items = body.items;
  let shape: ItemsShape = "other";
  let candidates: Record<string, unknown>[] = [];

  if (!hasItems || items === undefined || items === null) {
    shape = "absent";
  } else if (items === "") {
    shape = "empty_string";
  } else if (typeof items === "object" && !Array.isArray(items)) {
    const itemContainer = items as Record<string, unknown>;
    if (Object.keys(itemContainer).length === 0) {
      shape = "empty_object";
    } else if (Array.isArray(itemContainer.item)) {
      shape = "item_array";
      candidates = itemContainer.item.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      );
    } else if (
      itemContainer.item &&
      typeof itemContainer.item === "object" &&
      !Array.isArray(itemContainer.item)
    ) {
      shape = "single_item_object";
      candidates = [itemContainer.item as Record<string, unknown>];
    }
  }

  return {
    operation,
    format: "json",
    httpStatus: status,
    resultCode:
      header.resultCode === undefined ? null : String(header.resultCode),
    resultMsg: safeProviderMessage(header.resultMsg),
    itemsShape: shape,
    itemCount: candidates.length,
    topLevelFieldNames: [...new Set([
      ...Object.keys(root),
      ...Object.keys(response).map((key) => `response.${key}`),
      ...Object.keys(body).map((key) => `response.body.${key}`),
    ])].sort(),
    itemFieldNames: [...new Set(candidates.flatMap((item) => Object.keys(item)))].sort(),
    nonEmptyPetFieldNames: PET_FIELDS.filter((field) =>
      candidates.some((item) => {
        const value = item[field];
        return (typeof value === "string" || typeof value === "number") &&
          String(value).trim() !== "";
      }),
    ),
    petPolicyValuePresent: candidates.some(hasPetPolicyValue),
    parameterNames,
    transport: "success",
  };
}

function xmlTagValue(payload: string, tag: string): string | null {
  const match = payload.match(
    new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "iu"),
  );
  return safeProviderMessage(match?.[1]?.replace(/<[^>]+>/gu, ""));
}

function xmlObservation(
  operation: string,
  status: number,
  payload: string,
  parameterNames: string[],
): TraceObservation {
  const itemNodes = [...payload.matchAll(/<item>([\s\S]*?)<\/item>/giu)];
  const firstItem = itemNodes[0]?.[1] ?? "";
  const itemFieldNames = [
    ...new Set([...firstItem.matchAll(/<([A-Za-z][A-Za-z0-9]*)>/gu)].map((match) => match[1])),
  ].sort();
  const petPolicyValuePresent = PET_FIELDS.some((field) => {
    const value = xmlTagValue(firstItem, field);
    return value !== null && value !== "";
  });
  const nonEmptyPetFieldNames = PET_FIELDS.filter((field) => {
    const value = xmlTagValue(firstItem, field);
    return value !== null && value !== "";
  });
  return {
    operation,
    format: "xml",
    httpStatus: status,
    resultCode: xmlTagValue(payload, "resultCode"),
    resultMsg: xmlTagValue(payload, "resultMsg"),
    itemsShape: itemNodes.length > 0 ? "xml_item_nodes" : "absent",
    itemCount: itemNodes.length,
    topLevelFieldNames: ["response", "response.header", "response.body"],
    itemFieldNames,
    nonEmptyPetFieldNames,
    petPolicyValuePresent,
    parameterNames,
    transport: "success",
  };
}

async function main() {
  if (process.env.CI) throw new Error("LIVE_DIAGNOSTIC_DISABLED_IN_CI");
  const config = getTourApiConfig();
  const observations: TraceObservation[] = [];
  const responseCache = new Map<
    string,
    { body: string; status: number; statusText: string; headers: [string, string][] }
  >();
  let providerCalls = 0;

  const tracedFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const cached = responseCache.get(url.href);
    if (cached) {
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers: cached.headers,
      });
    }
    if (providerCalls >= MAX_PROVIDER_CALLS) {
      throw new Error("PROVIDER_CALL_LIMIT_REACHED");
    }
    providerCalls += 1;
    const operation = url.pathname.split("/").at(-1) ?? "unknown";
    const format = url.searchParams.get("_type") === "xml" ? "xml" : "json";
    const parameterNames = [...url.searchParams.keys()]
      .filter((name) => name.toLowerCase() !== "servicekey")
      .sort();
    try {
      const response = await fetch(url, init);
      const body = await response.text();
      responseCache.set(url.href, {
        body,
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers.entries()],
      });
      observations.push(
        format === "xml"
          ? xmlObservation(operation, response.status, body, parameterNames)
          : jsonObservation(operation, response.status, body, parameterNames),
      );
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      observations.push({
        operation,
        format,
        httpStatus: null,
        resultCode: null,
        resultMsg: null,
        itemsShape: "other",
        itemCount: 0,
        topLevelFieldNames: [],
        itemFieldNames: [],
        nonEmptyPetFieldNames: [],
        petPolicyValuePresent: false,
        parameterNames,
        transport: "failure",
      });
      throw error;
    }
  };

  function diagnosticUrl(
    operation: string,
    params: Record<string, string>,
    format: TraceFormat = "json",
  ): URL {
    const url = buildTourRequestUrl(config, "areaBasedList2", params);
    url.pathname = url.pathname.replace(/areaBasedList2$/u, operation);
    url.searchParams.set("_type", format);
    return url;
  }

  async function diagnosticJson(
    operation: string,
    params: Record<string, string>,
  ): Promise<ParsedTourResponse> {
    const response = await tracedFetch(diagnosticUrl(operation, params), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    return parseTourResponse(await response.text(), operation);
  }

  const encodedOnce = encodeServiceKeyExactlyOnce(config.serviceKey);
  const encodingProbe = buildTourRequestUrl(config, "areaBasedList2", {
    pageNo: "1",
    numOfRows: "1",
  }).href;
  const encodedTwice = encodeURIComponent(encodedOnce);
  const contract = {
    baseService: new URL(config.baseUrl).pathname.split("/").at(-1),
    serviceKeyMatchesExactlyOnce: encodingProbe.includes(`serviceKey=${encodedOnce}&`),
    serviceKeyMatchesDoubleEncoding:
      encodedTwice !== encodedOnce && encodingProbe.includes(`serviceKey=${encodedTwice}&`),
    maxProviderCalls: MAX_PROVIDER_CALLS,
  };

  const codeResponse = await diagnosticJson("ldongCode2", {
    pageNo: "1",
    numOfRows: "30",
    lDongListYn: "N",
  });
  const busan = codeResponse.items.find((item) =>
    (stringValue(item, "name", "lDongRegnNm", "ldongregnnm") ?? "").includes("부산"),
  );
  const busanCode = stringValue(busan ?? null, "code", "lDongRegnCd", "ldongregncd");
  if (!busanCode) throw new Error("BUSAN_REGION_CODE_NOT_FOUND");

  const syncResponse = await diagnosticJson("petTourSyncList2", {
    pageNo: "1",
    numOfRows: String(MAX_CANDIDATES),
    lDongRegnCd: busanCode,
  });
  const syncItems = syncResponse.items
    .filter((item) => stringValue(item, "contentid", "contentId"))
    .slice(0, MAX_CANDIDATES);
  if (syncItems.length === 0) throw new Error("EMPTY_PET_TOUR_SYNC_LIST");

  const client = new TourApiClient({
    fetchImpl: tracedFetch,
    transientRetryCount: 0,
  });
  const service = new KoreaTourismService(client);
  const area = await service.listPlaces({
    regionCode: busanCode,
    page: 1,
    pageSize: 20,
  });
  const areaIds = new Set(area.places.map((place) => place.contentId));
  const candidates: Record<string, unknown>[] = [];

  for (const syncItem of syncItems) {
    const contentId = stringValue(syncItem, "contentid", "contentId");
    if (!contentId) continue;
    const detail = await service.getPlaceDetail(contentId);
    const assessment = evaluateTourPetAccess(createTrustedTourPetAccessInput(detail));
    const rawPetObservation = observations
      .filter(
        (item) => item.operation === "detailPetTour2" && item.format === "json",
      )
      .at(-1);
    const rawPetFields = rawPetObservation?.itemFieldNames.filter((field) =>
        PET_FIELDS.includes(field as (typeof PET_FIELDS)[number]),
      ) ?? [];
    const rawNonEmptyPetFields = rawPetObservation?.nonEmptyPetFieldNames ?? [];
    const normalizedPetFields = detail.petPolicyEvidence
      ? Object.entries(detail.petPolicyEvidence.fields)
          .filter(([, value]) => Boolean(value))
          .map(([field]) => field)
      : [];
    candidates.push({
      contentId,
      syncContentTypeId: stringValue(syncItem, "contenttypeid", "contentTypeId"),
      areaPageOneMatch: areaIds.has(contentId),
      providerContentTypeId: detail.summary.providerContentTypeId,
      normalizedContentTypeId: detail.summary.contentTypeId,
      legalRegionCode: detail.summary.legalRegionCode,
      legalDistrictCode: detail.summary.legalDistrictCode,
      classificationCodes: detail.summary.classificationCodes,
      detailCommonStatus: detail.sections.common.status,
      detailPetStatus: detail.sections.petPolicy.status,
      introStatus: detail.sections.intro.status,
      petNormalizerBranch: detail.petPolicyEvidence
        ? normalizedPetFields.length > 0
          ? "policy_fields_normalized"
          : "item_present_without_policy_values"
        : "no_item",
      rawPetFieldNames: rawPetFields,
      rawNonEmptyPetFieldNames: rawNonEmptyPetFields,
      normalizedPetFieldNames: normalizedPetFields,
      lostNonEmptyPetFields: rawNonEmptyPetFields.filter(
        (field) => !normalizedPetFields.includes(field),
      ),
      verdict: assessment.verdict,
      applicability: assessment.evaluationState === "not_applicable"
        ? "not_applicable"
        : "applicable",
      evaluationState: assessment.evaluationState,
      reasonCodes: assessment.reasonCodes,
      assessmentSources: assessment.sources.map((source) => ({
        operation: source.operation,
        status: source.status,
      })),
    });
  }

  const xmlContentId = String(candidates[0]?.contentId ?? "");
  if (xmlContentId) {
    await tracedFetch(
      diagnosticUrl("detailPetTour2", { contentId: xmlContentId }, "xml"),
      {
        headers: { Accept: "application/xml" },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      },
    );
  }

  console.log(`SERVICE2_TRACE_CONTRACT=${JSON.stringify(contract)}`);
  console.log(`SERVICE2_TRACE_REGION=${JSON.stringify({ source: "ldongCode2", code: busanCode })}`);
  observations.forEach((observation, index) => {
    console.log(`SERVICE2_TRACE_OPERATION_${index + 1}=${JSON.stringify(observation)}`);
  });
  candidates.forEach((candidate, index) => {
    console.log(`SERVICE2_TRACE_CANDIDATE_${index + 1}=${JSON.stringify(candidate)}`);
  });
  console.log(`SERVICE2_TRACE_AREA_SYNC_OVERLAP=${candidates.filter((item) => item.areaPageOneMatch).length}`);
  console.log(`SERVICE2_TRACE_PROVIDER_CALLS=${providerCalls}`);
  console.log("SERVICE2_TRACE_STATUS=success");
}

main().catch((error: unknown) => {
  const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  console.error(`SERVICE2_TRACE_STATUS=failed:${safeProviderMessage(code)}`);
  process.exitCode = 1;
});
