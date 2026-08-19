import type { KakaoBusanCollectionQuery } from "@/lib/kakao/collection/query-registry-v1";
import type { PlaceCandidateKind } from "@/types/place-candidate";
import { PLACE_CANDIDATE_KINDS } from "@/types/place-candidate";
import { CollectionConfigurationError } from "@/lib/kakao/collection/errors";
import {
  KAKAO_COLLECTION_LIMITS,
  assertCollectionPlanWithinCap,
  plannedMaximumProviderCalls,
} from "@/lib/kakao/collection/runner";
import type { KakaoCollectionLimits } from "@/lib/kakao/collection/runner";

export type KakaoCollectionCliMode = "plan" | "dry-run" | "apply" | "resume";

export interface KakaoCollectionCliOptions {
  mode: KakaoCollectionCliMode;
  resumeRunId?: string;
  district?: string;
  kind?: PlaceCandidateKind;
}

const MODE_FLAGS = {
  "--plan": "plan",
  "--dry-run": "dry-run",
  "--apply": "apply",
  "--resume": "resume",
} as const satisfies Record<string, KakaoCollectionCliMode>;

function optionValue(
  args: readonly string[],
  index: number,
  name: "--district" | "--kind" | "--run-id",
): { value: string; nextIndex: number } | null {
  const argument = args[index];
  if (argument === name) {
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new CollectionConfigurationError(`${name} requires a value.`);
    }
    return { value, nextIndex: index + 1 };
  }
  if (argument.startsWith(`${name}=`)) {
    const value = argument.slice(name.length + 1).trim();
    if (!value) {
      throw new CollectionConfigurationError(`${name} requires a value.`);
    }
    return { value, nextIndex: index };
  }
  return null;
}

export function parseKakaoCollectionCliArgs(
  args: readonly string[],
): KakaoCollectionCliOptions {
  const modes: KakaoCollectionCliMode[] = [];
  let district: string | undefined;
  let kind: PlaceCandidateKind | undefined;
  let resumeRunId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--resume" || argument.startsWith("--resume=")) {
      modes.push("resume");
      const inlineValue = argument.startsWith("--resume=")
        ? argument.slice("--resume=".length).trim()
        : undefined;
      const nextValue = inlineValue || args[index + 1];
      if (nextValue && !nextValue.startsWith("--")) {
        resumeRunId = nextValue;
        if (!inlineValue) index += 1;
      }
      continue;
    }
    if (argument in MODE_FLAGS) {
      modes.push(MODE_FLAGS[argument as keyof typeof MODE_FLAGS]);
      continue;
    }

    const runIdOption = optionValue(args, index, "--run-id");
    if (runIdOption) {
      if (resumeRunId !== undefined) {
        throw new CollectionConfigurationError("The resume run ID may be supplied once.");
      }
      resumeRunId = runIdOption.value;
      index = runIdOption.nextIndex;
      continue;
    }

    const districtOption = optionValue(args, index, "--district");
    if (districtOption) {
      if (district !== undefined) {
        throw new CollectionConfigurationError("--district may be supplied once.");
      }
      district = districtOption.value.normalize("NFKC").trim();
      index = districtOption.nextIndex;
      continue;
    }

    const kindOption = optionValue(args, index, "--kind");
    if (kindOption) {
      if (kind !== undefined) {
        throw new CollectionConfigurationError("--kind may be supplied once.");
      }
      if (!PLACE_CANDIDATE_KINDS.includes(kindOption.value as PlaceCandidateKind)) {
        throw new CollectionConfigurationError("--kind is not a supported candidate kind.");
      }
      kind = kindOption.value as PlaceCandidateKind;
      index = kindOption.nextIndex;
      continue;
    }

    throw new CollectionConfigurationError("Unknown collector argument.");
  }

  if (modes.length !== 1) {
    throw new CollectionConfigurationError(
      "Supply exactly one of --plan, --dry-run, --apply, or --resume.",
    );
  }
  if (modes[0] === "resume" && !resumeRunId) {
    throw new CollectionConfigurationError("--resume requires a collection run ID.");
  }
  if (modes[0] !== "resume" && resumeRunId) {
    throw new CollectionConfigurationError("--run-id is valid only with --resume.");
  }

  return {
    mode: modes[0],
    ...(resumeRunId ? { resumeRunId } : {}),
    ...(district ? { district } : {}),
    ...(kind ? { kind } : {}),
  };
}

export function filterKakaoBusanCollectionQueries(
  queries: readonly KakaoBusanCollectionQuery[],
  options: Pick<KakaoCollectionCliOptions, "district" | "kind">,
): KakaoBusanCollectionQuery[] {
  let districtCode: string | undefined;
  if (options.district) {
    const district = queries.find(
      (query) =>
        query.districtCode === options.district ||
        query.districtName === options.district,
    );
    if (!district) {
      throw new CollectionConfigurationError("--district does not match a Busan district.");
    }
    districtCode = district.districtCode;
  }

  const selected = queries.filter(
    (query) =>
      (!districtCode || query.districtCode === districtCode) &&
      (!options.kind || query.candidateKind === options.kind),
  );
  if (selected.length === 0) {
    throw new CollectionConfigurationError("The filters selected no collection queries.");
  }
  return selected;
}

function countBy<T>(
  values: readonly T[],
  key: (value: T) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const name = key(value);
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

export interface KakaoCollectionPlanReport {
  mode: KakaoCollectionCliMode;
  registryVersion: string;
  queryCount: number;
  theoreticalMaxProviderCalls: number;
  physicalRequestCap: number;
  concurrency: number;
  pageSize: number;
  maxRetriesPerRequest: number;
  requestTimeoutMs: number;
  candidateKindQueryCounts: Record<string, number>;
  districtQueryCounts: Record<string, number>;
}

export function createKakaoCollectionPlanReport(input: {
  mode: KakaoCollectionCliMode;
  registryVersion: string;
  queries: readonly KakaoBusanCollectionQuery[];
  limits?: KakaoCollectionLimits;
}): KakaoCollectionPlanReport {
  const limits = input.limits ?? KAKAO_COLLECTION_LIMITS;
  assertCollectionPlanWithinCap(input.queries.length, limits);
  return {
    mode: input.mode,
    registryVersion: input.registryVersion,
    queryCount: input.queries.length,
    theoreticalMaxProviderCalls: plannedMaximumProviderCalls(input.queries.length, limits),
    physicalRequestCap: limits.requestCap,
    concurrency: limits.concurrency,
    pageSize: limits.pageSize,
    maxRetriesPerRequest: limits.maxRetries,
    requestTimeoutMs: limits.requestTimeoutMs,
    candidateKindQueryCounts: countBy(
      input.queries,
      (query) => query.candidateKind,
    ),
    districtQueryCounts: countBy(input.queries, (query) => query.districtName),
  };
}

export function selectKakaoCollectionDryRunQueries(
  queries: readonly KakaoBusanCollectionQuery[],
): KakaoBusanCollectionQuery[] {
  const samples = new Map<string, KakaoBusanCollectionQuery>();
  for (const query of queries) {
    const sampleKey = `${query.districtCode}:${query.family}`;
    if (!samples.has(sampleKey)) samples.set(sampleKey, query);
  }
  return [...samples.values()];
}
