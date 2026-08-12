const DEFAULT_MAX_TEXT_CHARACTERS = 240;

export const PET_DETAIL_FIELD_NAMES = [
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

export type ProviderItemsState = "absent" | "empty" | "present" | "invalid";

export interface ProviderResponseObservation {
  callNumber: number;
  operation: string;
  contentId: string | null;
  httpStatus: number | null;
  transport: "success" | "failure";
  resultCode: string | null;
  resultMessage: string | null;
  itemsState: ProviderItemsState;
  itemCount: number;
  itemFieldNames: string[];
  nonEmptyItemFieldNames: string[];
  errorCode: string | null;
}

export interface BoundedProviderFetchOptions {
  fetchImpl?: typeof fetch;
  requestCap: number;
  concurrency: number;
  timeoutMs: number;
  onObservation?: (observation: ProviderResponseObservation) => void;
}

export interface BoundedProviderFetch {
  fetchImpl: typeof fetch;
  stats(): {
    requestCap: number;
    providerCalls: number;
    concurrency: number;
    maxObservedConcurrency: number;
    timeoutMs: number;
  };
}

export interface AuditCandidateSeed {
  contentId: string;
  contentTypeId: string | null;
  title: string | null;
  sampleSource: "category_sample" | "supplied_id";
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name.toUpperCase()}_MUST_BE_A_POSITIVE_INTEGER`);
  }
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function providerOperation(input: RequestInfo | URL): {
  operation: string;
  contentId: string | null;
} {
  try {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw);
    return {
      operation: url.pathname.split("/").at(-1) || "unknown",
      contentId: url.searchParams.get("contentId"),
    };
  } catch {
    return { operation: "unknown", contentId: null };
  }
}

function itemRecords(value: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(value)) {
    return value.every(
      (item) => Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
      ? (value as Record<string, unknown>[])
      : null;
  }
  if (value && typeof value === "object") {
    return [value as Record<string, unknown>];
  }
  return null;
}

function nonEmptyProviderValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim() !== "";
  return typeof value === "number" || typeof value === "boolean";
}

export function sanitizeDiagnosticText(
  value: unknown,
  maxCharacters = DEFAULT_MAX_TEXT_CHARACTERS,
): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value)
    .replace(/https?:\/\/[^\s"'<>]+/giu, "[url omitted]")
    .replace(
      /\b(?:serviceKey|TOUR_API_SERVICE_KEY|Authorization)\s*[:=]\s*[^\s&,;]+/giu,
      "[credential omitted]",
    )
    .replace(/\bBearer\s+[^\s,;]+/giu, "Bearer [credential omitted]")
    .replace(/[\u0000-\u001f\u007f]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!text) return null;
  return Array.from(text).slice(0, maxCharacters).join("");
}

const OMITTED_ARTIFACT_KEY =
  /^(?:authorization|requestUrl|rawBody|rawPayload|rawResponse|serviceKey|tourApiServiceKey)$/iu;

export function sanitizeArtifactValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeDiagnosticText(value);
  if (Array.isArray(value)) return value.map(sanitizeArtifactValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      OMITTED_ARTIFACT_KEY.test(key)
        ? "[omitted]"
        : sanitizeArtifactValue(item),
    ]),
  );
}

export function stringifySanitizedArtifact(value: unknown): string {
  return `${JSON.stringify(sanitizeArtifactValue(value), null, 2)}\n`;
}

/** Visibility sync proves display status, not discovery through a list call. */
export function wasListedForAudit(
  contentId: string,
  categoryListContentIds: ReadonlySet<string>,
  regionalListContentIds: ReadonlySet<string>,
): boolean {
  return (
    categoryListContentIds.has(contentId) ||
    regionalListContentIds.has(contentId)
  );
}

export interface SuppliedListJoinTarget {
  contentId: string;
  regionCode: string;
  districtCode: string | null;
  contentTypeId: string;
}

export interface SuppliedListJoinGroup {
  regionCode: string;
  districtCode: string | null;
  contentTypeId: string;
  contentIds: string[];
}

/** Groups missing list evidence independently from visibility-sync membership. */
export function groupSuppliedListJoinTargets(
  targets: readonly SuppliedListJoinTarget[],
  alreadyListedContentIds: ReadonlySet<string>,
): SuppliedListJoinGroup[] {
  const groups = new Map<string, SuppliedListJoinGroup>();
  const seen = new Set<string>();
  for (const target of targets) {
    if (alreadyListedContentIds.has(target.contentId) || seen.has(target.contentId)) {
      continue;
    }
    seen.add(target.contentId);
    const key = `${target.regionCode}:${target.districtCode ?? ""}:${target.contentTypeId}`;
    const group = groups.get(key) ?? {
      regionCode: target.regionCode,
      districtCode: target.districtCode,
      contentTypeId: target.contentTypeId,
      contentIds: [],
    };
    group.contentIds.push(target.contentId);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      contentIds: group.contentIds.slice().sort(compareText),
    }))
    .sort(
      (left, right) =>
        compareText(left.regionCode, right.regionCode) ||
        compareText(left.districtCode ?? "", right.districtCode ?? "") ||
        compareText(left.contentTypeId, right.contentTypeId),
    );
}

export function inspectProviderPayload(
  payload: string,
  input: {
    callNumber: number;
    operation: string;
    contentId: string | null;
    httpStatus: number;
  },
): ProviderResponseObservation {
  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    return {
      ...input,
      transport: "success",
      resultCode: null,
      resultMessage: null,
      itemsState: "invalid",
      itemCount: 0,
      itemFieldNames: [],
      nonEmptyItemFieldNames: [],
      errorCode: null,
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
  const items = body.items;

  let itemsState: ProviderItemsState = "absent";
  let records: Record<string, unknown>[] = [];
  if (items === "" || (items && typeof items === "object" && Object.keys(items).length === 0)) {
    itemsState = "empty";
  } else if (items !== undefined && items !== null) {
    if (!items || typeof items !== "object" || Array.isArray(items)) {
      itemsState = "invalid";
    } else {
      const container = items as Record<string, unknown>;
      if (!("item" in container) || container.item === "" || container.item === null) {
        itemsState = "empty";
      } else {
        const parsedRecords = itemRecords(container.item);
        if (parsedRecords) {
          records = parsedRecords;
          itemsState = records.length > 0 ? "present" : "empty";
        } else {
          itemsState = "invalid";
        }
      }
    }
  }

  const itemFieldNames = [
    ...new Set(records.flatMap((record) => Object.keys(record))),
  ].sort(compareText);
  const nonEmptyItemFieldNames = itemFieldNames.filter((field) =>
    records.some((record) => nonEmptyProviderValue(record[field])),
  );

  return {
    ...input,
    transport: "success",
    resultCode:
      header.resultCode === undefined ? null : String(header.resultCode),
    resultMessage: sanitizeDiagnosticText(header.resultMsg, 120),
    itemsState,
    itemCount: records.length,
    itemFieldNames,
    nonEmptyItemFieldNames,
    errorCode: null,
  };
}

class ProviderRequestBudget {
  private used = 0;

  constructor(readonly cap: number) {
    assertPositiveInteger(cap, "request_cap");
  }

  consume(): number {
    if (this.used >= this.cap) {
      throw new Error("PROVIDER_CALL_LIMIT_REACHED");
    }
    this.used += 1;
    return this.used;
  }

  count(): number {
    return this.used;
  }
}

class ProviderSemaphore {
  private active = 0;
  private maxActive = 0;
  private readonly queue: Array<() => void> = [];

  constructor(readonly limit: number) {
    assertPositiveInteger(limit, "concurrency");
  }

  async acquire(): Promise<() => void> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.queue.shift()?.();
    };
  }

  maxObserved(): number {
    return this.maxActive;
  }
}

function mergedSignal(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
): AbortSignal {
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (input instanceof Request) signals.push(input.signal);
  if (init?.signal) signals.push(init.signal);
  return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
}

function failureObservation(
  callNumber: number,
  operation: string,
  contentId: string | null,
  error: unknown,
): ProviderResponseObservation {
  const errorCode =
    error && typeof error === "object" && "code" in error
      ? sanitizeDiagnosticText(String(error.code), 80)
      : error instanceof Error
        ? sanitizeDiagnosticText(error.name, 80)
        : "UNKNOWN_ERROR";
  return {
    callNumber,
    operation,
    contentId,
    httpStatus: null,
    transport: "failure",
    resultCode: null,
    resultMessage: null,
    itemsState: "invalid",
    itemCount: 0,
    itemFieldNames: [],
    nonEmptyItemFieldNames: [],
    errorCode,
  };
}

export function createBoundedProviderFetch(
  options: BoundedProviderFetchOptions,
): BoundedProviderFetch {
  assertPositiveInteger(options.timeoutMs, "timeout_ms");
  const baseFetch = options.fetchImpl ?? fetch;
  const budget = new ProviderRequestBudget(options.requestCap);
  const semaphore = new ProviderSemaphore(options.concurrency);

  const boundedFetch: typeof fetch = async (input, init) => {
    const release = await semaphore.acquire();
    let callNumber: number | null = null;
    const request = providerOperation(input);
    try {
      callNumber = budget.consume();
      const response = await baseFetch(input, {
        ...init,
        signal: mergedSignal(input, init, options.timeoutMs),
      });
      const body = await response.text();
      options.onObservation?.(
        inspectProviderPayload(body, {
          callNumber,
          operation: request.operation,
          contentId: request.contentId,
          httpStatus: response.status,
        }),
      );
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      if (callNumber !== null) {
        options.onObservation?.(
          failureObservation(
            callNumber,
            request.operation,
            request.contentId,
            error,
          ),
        );
      }
      throw error;
    } finally {
      release();
    }
  };

  return {
    fetchImpl: boundedFetch,
    stats: () => ({
      requestCap: options.requestCap,
      providerCalls: budget.count(),
      concurrency: options.concurrency,
      maxObservedConcurrency: semaphore.maxObserved(),
      timeoutMs: options.timeoutMs,
    }),
  };
}

export function selectDeterministicCategorySample(
  values: readonly AuditCandidateSeed[],
  contentTypeOrder: readonly string[],
  perCategory: number,
): AuditCandidateSeed[] {
  assertPositiveInteger(perCategory, "per_category");
  const selected: AuditCandidateSeed[] = [];
  const seen = new Set<string>();

  for (const contentTypeId of contentTypeOrder) {
    const candidates = values
      .filter((value) => value.contentTypeId === contentTypeId)
      .slice()
      .sort((left, right) => compareText(left.contentId, right.contentId));
    for (const candidate of candidates) {
      if (seen.has(candidate.contentId)) continue;
      selected.push(candidate);
      seen.add(candidate.contentId);
      if (
        selected.filter((value) => value.contentTypeId === contentTypeId).length >=
        perCategory
      ) {
        break;
      }
    }
  }
  return selected;
}

export function mergeAuditCandidateSeeds(
  sampled: readonly AuditCandidateSeed[],
  suppliedContentIds: readonly string[],
  maxDetailedRecords: number,
  contentTypeOrder: readonly string[],
): AuditCandidateSeed[] {
  assertPositiveInteger(maxDetailedRecords, "max_detailed_records");
  const values = new Map<string, AuditCandidateSeed>();
  for (const candidate of sampled) values.set(candidate.contentId, candidate);
  for (const contentId of suppliedContentIds.slice().sort(compareText)) {
    if (!values.has(contentId)) {
      values.set(contentId, {
        contentId,
        contentTypeId: null,
        title: null,
        sampleSource: "supplied_id",
      });
    }
  }

  const rank = new Map(contentTypeOrder.map((type, index) => [type, index]));
  const sorted = [...values.values()].sort(
    (left, right) =>
      (rank.get(left.contentTypeId ?? "") ?? contentTypeOrder.length) -
        (rank.get(right.contentTypeId ?? "") ?? contentTypeOrder.length) ||
      compareText(left.contentId, right.contentId),
  );
  if (sorted.length > maxDetailedRecords) {
    throw new Error("DETAILED_RECORD_LIMIT_REACHED");
  }
  return sorted;
}

export function sortAuditRows<T extends { contentId: string; contentType: string | null }>(
  values: readonly T[],
  contentTypeOrder: readonly string[],
): T[] {
  const rank = new Map(contentTypeOrder.map((type, index) => [type, index]));
  return values.slice().sort(
    (left, right) =>
      (rank.get(left.contentType ?? "") ?? contentTypeOrder.length) -
        (rank.get(right.contentType ?? "") ?? contentTypeOrder.length) ||
      compareText(left.contentId, right.contentId),
  );
}

export function markdownCell(value: unknown): string {
  const sanitized = sanitizeDiagnosticText(value) ?? "-";
  return sanitized.replace(/\|/gu, "\\|");
}
