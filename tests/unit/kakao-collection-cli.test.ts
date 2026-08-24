import { describe, expect, it } from "vitest";
import {
  createKakaoCollectionPlanReport,
  filterKakaoBusanCollectionQueries,
  parseKakaoCollectionCliArgs,
  selectKakaoCollectionDryRunQueries,
} from "@/lib/kakao/collection/cli";
import type { KakaoBusanCollectionQuery } from "@/lib/kakao/collection/query-registry-v1";
import { KAKAO_BUSAN_COLLECTION_QUERIES } from "@/lib/kakao/collection/query-registry-v1";
import { BUSAN_REGION_CONFIG } from "@/lib/regions/config";

const DISTRICT_A = BUSAN_REGION_CONFIG.districts[0];
const DISTRICT_B = BUSAN_REGION_CONFIG.districts[1];
const A = {
  districtCode: DISTRICT_A.legalDongDistrictCode,
  districtName: DISTRICT_A.name,
};
const B = {
  districtCode: DISTRICT_B.legalDongDistrictCode,
  districtName: DISTRICT_B.name,
};

function query(input: {
  key: string;
  districtCode: KakaoBusanCollectionQuery["districtCode"];
  districtName: KakaoBusanCollectionQuery["districtName"];
  candidateKind: "pet_travel_candidate" | "veterinary" | "pet_shop";
}): KakaoBusanCollectionQuery {
  return {
    ...input,
    registryVersion: "kakao-busan-query-registry-v1",
    family:
      input.candidateKind === "pet_travel_candidate"
        ? "general"
        : input.candidateKind,
    templateIndex: 0,
    queryText: `sample ${input.key}`,
    normalizedCategoryHint:
      input.candidateKind === "pet_travel_candidate" ? "other" : null,
  };
}

const QUERIES = [
  query({ key: "a:travel", ...A, candidateKind: "pet_travel_candidate" }),
  query({ key: "a:vet", ...A, candidateKind: "veterinary" }),
  query({ key: "a:shop", ...A, candidateKind: "pet_shop" }),
  query({ key: "a:travel:2", ...A, candidateKind: "pet_travel_candidate" }),
  query({ key: "b:travel", ...B, candidateKind: "pet_travel_candidate" }),
  query({ key: "b:vet", ...B, candidateKind: "veterinary" }),
] as const;

describe("Kakao collection CLI planning", () => {
  it("requires exactly one execution mode and rejects unknown arguments", () => {
    expect(() => parseKakaoCollectionCliArgs([])).toThrow(/exactly one/i);
    expect(() => parseKakaoCollectionCliArgs(["--plan", "--apply"])).toThrow(
      /exactly one/i,
    );
    expect(() => parseKakaoCollectionCliArgs(["--plan", "--secret"])).toThrow(
      /unknown collector argument/i,
    );
    expect(() => parseKakaoCollectionCliArgs(["--resume"])).toThrow(/run ID/i);
  });

  it("requires and parses an explicit resume run ID", () => {
    expect(parseKakaoCollectionCliArgs(["--resume", "run-42"])).toEqual({
      mode: "resume",
      resumeRunId: "run-42",
    });
    expect(
      parseKakaoCollectionCliArgs(["--resume", "--run-id=run-43"]),
    ).toEqual({ mode: "resume", resumeRunId: "run-43" });
    expect(() =>
      parseKakaoCollectionCliArgs(["--apply", "--run-id=run-43"]),
    ).toThrow(/only with --resume/i);
  });

  it("parses district and canonical kind filters without accepting legacy kinds", () => {
    expect(
      parseKakaoCollectionCliArgs([
        "--dry-run",
        `--district=${DISTRICT_A.name}`,
        "--kind",
        "veterinary",
      ]),
    ).toEqual({
      mode: "dry-run",
      district: DISTRICT_A.name,
      kind: "veterinary",
    });
    expect(() =>
      parseKakaoCollectionCliArgs(["--plan", "--kind=travel_candidate"]),
    ).toThrow(/supported candidate kind/i);
  });

  it("filters by district code or exact name and produces a secret-free plan", () => {
    const selected = filterKakaoBusanCollectionQueries(QUERIES, {
      district: DISTRICT_A.legalDongDistrictCode,
      kind: "veterinary",
    });
    expect(selected.map(({ key }) => key)).toEqual(["a:vet"]);
    expect(createKakaoCollectionPlanReport({
      mode: "plan",
      registryVersion: "v1",
      queries: selected,
    })).toEqual(expect.objectContaining({
      queryCount: 1,
      theoreticalMaxProviderCalls: 3,
      physicalRequestCap: 1_500,
      concurrency: 2,
      candidateKindQueryCounts: { veterinary: 1 },
      districtQueryCounts: { [DISTRICT_A.name]: 1 },
    }));
  });

  it("selects one deterministic dry-run query per district and query family", () => {
    expect(
      selectKakaoCollectionDryRunQueries(QUERIES).map(({ key }) => key),
    ).toEqual(["a:travel", "a:vet", "a:shop", "b:travel", "b:vet"]);
    const fullSamples = selectKakaoCollectionDryRunQueries(
      KAKAO_BUSAN_COLLECTION_QUERIES,
    );
    expect(fullSamples).toHaveLength(112);
    expect(createKakaoCollectionPlanReport({
      mode: "dry-run",
      registryVersion: "v1",
      queries: fullSamples,
    }).theoreticalMaxProviderCalls).toBe(336);
  });
});
