import { describe, expect, it } from "vitest";
import {
  createBoundedProviderFetch,
  groupSuppliedListJoinTargets,
  inspectProviderPayload,
  mergeAuditCandidateSeeds,
  sanitizeArtifactValue,
  selectDeterministicCategorySample,
  sortAuditRows,
  stringifySanitizedArtifact,
  wasListedForAudit,
  type AuditCandidateSeed,
} from "@/scripts/lib/tour-contract-audit";

function providerEnvelope(items: unknown): string {
  return JSON.stringify({
    response: {
      header: { resultCode: "0000", resultMsg: "NORMAL SERVICE" },
      body: { items, pageNo: 1, numOfRows: 20, totalCount: 1 },
    },
  });
}

describe("Tour Service2 contract audit safety helpers", () => {
  it("keeps list success independent from visibility-sync membership", () => {
    const categoryListIds = new Set(["listed-category"]);
    const regionalListIds = new Set(["listed-region"]);

    expect(
      wasListedForAudit("sync-only", categoryListIds, regionalListIds),
    ).toBe(false);
    expect(
      wasListedForAudit("listed-category", categoryListIds, regionalListIds),
    ).toBe(true);
    expect(
      wasListedForAudit("listed-region", categoryListIds, regionalListIds),
    ).toBe(true);
  });

  it("groups Busan shopping supplied ids for a list join even when the main sample omits shopping", () => {
    const groups = groupSuppliedListJoinTargets(
      [
        {
          contentId: "2930927",
          regionCode: "26",
          districtCode: "350",
          contentTypeId: "38",
        },
        {
          contentId: "4008098",
          regionCode: "26",
          districtCode: "710",
          contentTypeId: "38",
        },
        {
          contentId: "already-listed",
          regionCode: "26",
          districtCode: "350",
          contentTypeId: "12",
        },
        {
          contentId: "outside-busan",
          regionCode: "11",
          districtCode: null,
          contentTypeId: "38",
        },
      ],
      new Set(["already-listed"]),
    );

    expect(groups).toEqual([
      {
        regionCode: "11",
        districtCode: null,
        contentTypeId: "38",
        contentIds: ["outside-busan"],
      },
      {
        regionCode: "26",
        districtCode: "350",
        contentTypeId: "38",
        contentIds: ["2930927"],
      },
      {
        regionCode: "26",
        districtCode: "710",
        contentTypeId: "38",
        contentIds: ["4008098"],
      },
    ]);
  });

  it("enforces one actual-request cap and provider-level concurrency", async () => {
    let active = 0;
    let maximumActive = 0;
    let actualCalls = 0;
    const fetchImpl: typeof fetch = async () => {
      actualCalls += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return new Response(providerEnvelope({ item: { contentid: "1" } }));
    };
    const bounded = createBoundedProviderFetch({
      fetchImpl,
      requestCap: 3,
      concurrency: 2,
      timeoutMs: 1_000,
    });

    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, (_, index) =>
        bounded.fetchImpl(
          `https://apis.data.go.kr/B551011/KorPetTourService2/detailCommon2?contentId=${index}`,
        ),
      ),
    );

    expect(actualCalls).toBe(3);
    expect(maximumActive).toBeLessThanOrEqual(2);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(3);
    expect(
      outcomes.filter(
        (outcome) =>
          outcome.status === "rejected" &&
          String(outcome.reason).includes("PROVIDER_CALL_LIMIT_REACHED"),
      ),
    ).toHaveLength(2);
    expect(bounded.stats()).toMatchObject({
      providerCalls: 3,
      requestCap: 3,
      maxObservedConcurrency: 2,
    });
  });

  it("applies its own timeout to every actual provider fetch", async () => {
    const fetchImpl: typeof fetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason ?? new Error("aborted")),
          { once: true },
        );
      });
    const bounded = createBoundedProviderFetch({
      fetchImpl,
      requestCap: 1,
      concurrency: 1,
      timeoutMs: 5,
    });

    await expect(
      bounded.fetchImpl(
        "https://apis.data.go.kr/B551011/KorPetTourService2/detailPetTour2?contentId=1",
      ),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(bounded.stats().providerCalls).toBe(1);
  });

  it("extracts only structural response metadata and distinguishes empty shapes", () => {
    const present = inspectProviderPayload(
      providerEnvelope({
        item: {
          contentid: "100",
          acmpyTypeCd: "allowed text that must not be copied",
          acmpyNeedMtr: "",
        },
      }),
      {
        callNumber: 1,
        operation: "detailPetTour2",
        contentId: "100",
        httpStatus: 200,
      },
    );
    const empty = inspectProviderPayload(providerEnvelope({}), {
      callNumber: 2,
      operation: "detailPetTour2",
      contentId: "101",
      httpStatus: 200,
    });

    expect(present).toMatchObject({
      itemsState: "present",
      itemCount: 1,
      resultCode: "0000",
      resultMessage: "NORMAL SERVICE",
    });
    expect(present.itemFieldNames).toEqual([
      "acmpyNeedMtr",
      "acmpyTypeCd",
      "contentid",
    ]);
    expect(present.nonEmptyItemFieldNames).toEqual([
      "acmpyTypeCd",
      "contentid",
    ]);
    expect(JSON.stringify(present)).not.toContain("allowed text");
    expect(empty).toMatchObject({ itemsState: "empty", itemCount: 0 });
  });

  it("redacts credentials, URLs, authorization and raw-response keys deeply", () => {
    const unsafe = {
      serviceKey: "top-secret",
      nested: {
        Authorization: "Bearer second-secret",
        error:
          "failed https://apis.data.go.kr/path?serviceKey=third-secret Authorization=Bearer-fourth",
        rawPayload: "full provider response",
      },
    };
    const sanitized = sanitizeArtifactValue(unsafe);
    const serialized = stringifySanitizedArtifact(unsafe);

    expect(sanitized).toMatchObject({
      serviceKey: "[omitted]",
      nested: {
        Authorization: "[omitted]",
        rawPayload: "[omitted]",
      },
    });
    for (const secret of [
      "top-secret",
      "second-secret",
      "third-secret",
      "Bearer-fourth",
      "full provider response",
      "https://apis.data.go.kr",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("selects balanced samples and merges supplied ids in stable order", () => {
    const values: AuditCandidateSeed[] = [
      ["39-2", "39"],
      ["12-3", "12"],
      ["12-1", "12"],
      ["39-1", "39"],
      ["12-2", "12"],
    ].map(([contentId, contentTypeId]) => ({
      contentId,
      contentTypeId,
      title: null,
      sampleSource: "category_sample",
    }));
    const sampled = selectDeterministicCategorySample(values, ["12", "39"], 2);
    const merged = mergeAuditCandidateSeeds(
      sampled,
      ["supplied-z", "supplied-a", "12-1"],
      10,
      ["12", "39"],
    );

    expect(sampled.map(({ contentId }) => contentId)).toEqual([
      "12-1",
      "12-2",
      "39-1",
      "39-2",
    ]);
    expect(merged.map(({ contentId }) => contentId)).toEqual([
      "12-1",
      "12-2",
      "39-1",
      "39-2",
      "supplied-a",
      "supplied-z",
    ]);
    expect(merged.at(-1)?.sampleSource).toBe("supplied_id");
  });

  it("sorts final audit rows by explicit category order and content id", () => {
    const rows = sortAuditRows(
      [
        { contentId: "z", contentType: null },
        { contentId: "2", contentType: "39" },
        { contentId: "3", contentType: "12" },
        { contentId: "1", contentType: "39" },
      ],
      ["12", "39"],
    );
    expect(rows.map(({ contentId }) => contentId)).toEqual(["3", "1", "2", "z"]);
  });

  it("refuses to silently truncate the detailed-record set", () => {
    expect(() =>
      mergeAuditCandidateSeeds(
        [],
        ["1", "2", "3"],
        2,
        ["12"],
      ),
    ).toThrow("DETAILED_RECORD_LIMIT_REACHED");
  });
});
