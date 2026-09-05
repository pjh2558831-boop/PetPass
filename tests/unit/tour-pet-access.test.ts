import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PET_ACCESS_LIMITS } from "@/lib/pet-access/tourism/constants";
import {
  evaluateTourPetAccess,
  type TrustedTourPetAccessInput,
} from "@/lib/pet-access/tourism/evaluator";
import {
  normalizeProviderPolicyText,
  splitPolicyClauses,
} from "@/lib/pet-access/tourism/normalizers";
import type {
  TourIntroPetPolicyEvidence,
  TourPetPolicyEvidence,
  TourPetPolicyFields,
} from "@/types/place";
import type {
  TourPetAccessConditionType,
  TourPetAccessVerdict,
} from "@/types/tour-pet-access";

const RETRIEVED_AT = "2026-08-05T00:00:00.000Z";

const EMPTY_FIELDS: TourPetPolicyFields = {
  acmpyTypeCd: null,
  acmpyPsblCpam: null,
  acmpyNeedMtr: null,
  etcAcmpyInfo: null,
  relaAcdntRiskMtr: null,
  relaPosesFclty: null,
  relaFrnshPrdlst: null,
  relaPurcPrdlst: null,
  relaRntlPrdlst: null,
};

function primaryEvidence(
  fields: Partial<TourPetPolicyFields>,
): TourPetPolicyEvidence {
  const normalized = { ...EMPTY_FIELDS, ...fields };
  return {
    fields: normalized,
    sourceEvidence: {
      provider: "Korea Tourism Organization",
      operation: "detailPetTour2",
      contentId: "100",
      retrievedAt: RETRIEVED_AT,
      providerModifiedTime: "20260805000000",
      originalEvidenceFields: { ...normalized },
    },
  };
}

function fallbackEvidence(
  value: string,
  field: TourIntroPetPolicyEvidence["field"] = "chkpetshopping",
): TourIntroPetPolicyEvidence {
  return {
    field,
    value,
    sourceEvidence: {
      provider: "Korea Tourism Organization",
      operation: "detailIntro2",
      contentId: "100",
      retrievedAt: RETRIEVED_AT,
      providerModifiedTime: "20260805000000",
      originalValue: value,
    },
  };
}

function trustedInput(options: {
  fields?: Partial<TourPetPolicyFields>;
  providerContentTypeId?: string | null;
  primaryStatus?: "available" | "unavailable";
  fallbackStatus?: "available" | "unavailable";
  fallback?: TourIntroPetPolicyEvidence | null;
} = {}): TrustedTourPetAccessInput {
  return {
    contentId: "100",
    providerContentTypeId: options.providerContentTypeId ?? "38",
    retrievedAt: RETRIEVED_AT,
    providerModifiedTime: "20260805000000",
    primary: {
      status: options.primaryStatus ?? "available",
      evidence:
        options.primaryStatus === "unavailable"
          ? null
          : primaryEvidence(options.fields ?? {}),
    },
    fallback: {
      status: options.fallbackStatus ?? "available",
      evidence: options.fallback ?? null,
    },
  };
}

function assess(
  fields: Partial<TourPetPolicyFields>,
  options: Omit<Parameters<typeof trustedInput>[0], "fields"> = {},
) {
  return evaluateTourPetAccess(trustedInput({ ...options, fields }));
}

describe("Tourism pet policy normalization", () => {
  it("normalizes Unicode with NFKC", () => {
    expect(normalizeProviderPolicyText("ＡＢＣ 반려동물")?.normalizedText).toBe(
      "abc 반려동물",
    );
  });

  it("decodes HTML entities", () => {
    expect(normalizeProviderPolicyText("반려동물&nbsp;동반 &amp; 이용")?.originalText).toBe(
      "반려동물 동반 & 이용",
    );
  });

  it("turns break and paragraph tags into clause boundaries", () => {
    const normalized = normalizeProviderPolicyText(
      "<p>반려동물 동반 가능</p><br>목줄 필수",
    );
    expect(normalized && splitPolicyClauses(normalized).map((item) => item.originalText)).toEqual([
      "반려동물 동반 가능",
      "목줄 필수",
    ]);
  });

  it("normalizes whitespace and punctuation without keeping HTML", () => {
    const normalized = normalizeProviderPolicyText("  반려동물\t 동반 — 가능 <b>안내</b>  ");
    expect(normalized?.originalText).toBe("반려동물 동반 - 가능 안내");
    expect(normalized?.originalText).not.toContain("<b>");
  });

  it("removes formatting tags after decoding HTML entities", () => {
    const normalized = normalizeProviderPolicyText(
      "&lt;b&gt;반려동물 동반 가능&lt;/b&gt;",
    );
    expect(normalized?.originalText).toBe("반려동물 동반 가능");
    expect(normalized?.originalText).not.toMatch(/[<>]/u);
  });

  it("bounds trusted source fields", () => {
    const normalized = normalizeProviderPolicyText("가".repeat(2_100));
    expect(Array.from(normalized?.originalText ?? "")).toHaveLength(
      PET_ACCESS_LIMITS.sourceFieldCharacters,
    );
    expect(normalized?.truncated).toBe(true);
  });
});

describe("deterministic Tourism pet-access verdicts", () => {
  it.each<[string, Partial<TourPetPolicyFields>, TourPetAccessVerdict]>([
    ["verified structured allowance", { acmpyTypeCd: "전구역 동반가능" }, "allowed"],
    ["direct textual allowance", { etcAcmpyInfo: "반려동물 동반 가능" }, "allowed"],
    ["direct denial", { etcAcmpyInfo: "반려동물 동반 불가" }, "not_allowed"],
    ["cannot accompany", { etcAcmpyInfo: "반려동물은 동반할 수 없습니다" }, "not_allowed"],
    ["exit prohibition", { etcAcmpyInfo: "반려동물 출입 금지" }, "not_allowed"],
    ["entry denied", { etcAcmpyInfo: "반려동물 입장 불가" }, "not_allowed"],
    ["small dogs only", { acmpyPsblCpam: "소형견만 가능" }, "conditional"],
    ["indoor denied outdoor allowed", { etcAcmpyInfo: "실내는 동반 불가하지만 야외는 가능" }, "conditional"],
    ["terrace only", { etcAcmpyInfo: "테라스에서만 동반 가능" }, "conditional"],
    ["selected room", { etcAcmpyInfo: "일부 객실만 반려동물 동반 가능" }, "conditional"],
    ["designated area", { etcAcmpyInfo: "지정 구역에서만 동반 가능" }, "conditional"],
    ["inquiry only", { etcAcmpyInfo: "반려동물 동반 여부 문의 필요" }, "unknown"],
    ["possible inquiry", { etcAcmpyInfo: "동반 가능 여부는 전화 문의" }, "unknown"],
    ["condition only", { acmpyNeedMtr: "목줄 착용 필수" }, "unknown"],
    ["product amenity", { relaPurcPrdlst: "애견용품 판매" }, "unknown"],
    ["facility amenity", { relaPosesFclty: "반려동물 시설 보유" }, "unknown"],
    ["restriction absent", { etcAcmpyInfo: "반려동물 동반 제한 없음" }, "unknown"],
    ["not prohibited", { etcAcmpyInfo: "반려동물 동반 금지하지 않음" }, "unknown"],
    ["not impossible", { etcAcmpyInfo: "반려동물 동반 불가하지 않음" }, "unknown"],
    ["plain placeholder", { etcAcmpyInfo: "정보 없음" }, "unknown"],
  ])("returns the expected verdict for %s", (_name, fields, verdict) => {
    expect(assess(fields).verdict).toBe(verdict);
  });

  it("keeps facility and product amenities neutral without direct access wording", () => {
    const result = assess({
      relaPosesFclty: "목줄과 배변봉투 비치",
      relaFrnshPrdlst: "반려동물 유모차 대여",
    });
    expect(result).toMatchObject({
      verdict: "unknown",
      evaluationState: "insufficient_evidence",
    });
    expect(result.evidence).toEqual([]);
    expect(result.conditions).toEqual([]);
  });

  it("uses a low-priority facility field only when it directly states access", () => {
    const result = assess({ relaPosesFclty: "야외 반려동물 동반 가능" });
    expect(result).toMatchObject({ verdict: "conditional", evaluationState: "complete" });
    expect(result.permittedScopes).toContain("outdoor");
  });

  it.each<[string, string, TourPetAccessConditionType]>([
    ["weight", "반려동물 동반 가능, 10kg 이하", "weight_limit"],
    ["pet count", "반려동물 동반 가능, 2마리 이하", "pet_count_limit"],
    ["leash", "반려동물 동반 가능, 목줄 착용 필수", "leash_required"],
    ["harness", "반려동물 동반 가능, 하네스 착용 필수", "harness_required"],
    ["muzzle", "반려동물 동반 가능, 맹견은 입마개 필수", "muzzle_required"],
    ["carrier", "반려동물 동반 가능, 이동장 사용 필수", "carrier_required"],
    ["stroller", "반려동물 동반 가능, 반려동물 유모차 필수", "stroller_required"],
    ["vaccination", "반려동물 동반 가능, 예방접종 필수", "vaccination_required"],
    ["document", "반려동물 동반 가능, 접종 증명서 지참", "document_required"],
    ["reservation", "반려동물 동반 가능, 사전 예약 필수", "reservation_required"],
    ["advance inquiry", "사전 문의 후 반려동물 동반 가능", "advance_inquiry_required"],
    ["fee", "반려동물 동반 가능, 추가 요금 10000원", "fee_required"],
    ["deposit", "반려동물 동반 가능, 보증금 필요", "deposit_required"],
    ["supervision", "반려동물 동반 가능, 보호자 관리 필수", "owner_supervision"],
    ["sanitation", "반려동물 동반 가능, 배변봉투 지참", "sanitation_requirement"],
  ])("extracts the %s condition", (_name, text, conditionType) => {
    const result = assess({ etcAcmpyInfo: text });
    expect(result.verdict).toBe("conditional");
    expect(result.conditions.map((condition) => condition.type)).toContain(conditionType);
  });
});

describe("Tourism pet-access evidence and source states", () => {
  it("evaluates current type-38 primary evidence instead of rejecting applicability", () => {
    const result = evaluateTourPetAccess(
      trustedInput({
        providerContentTypeId: "38",
        fields: { acmpyTypeCd: "전구역 동반가능" },
      }),
    );
    expect(result).toMatchObject({
      verdict: "allowed",
      evaluationState: "complete",
    });
    expect(result.evidence[0]).toMatchObject({
      operation: "detailPetTour2",
      field: "acmpyTypeCd",
    });
    expect(result.sources[0].status).toBe("available");
  });

  it("keeps a dangerous-dog restriction compatible with general allowance", () => {
    const result = assess({
      acmpyPsblCpam: "전 견종 동반 가능",
      etcAcmpyInfo: "맹견 입장 불가, 일반 반려견 동반 가능",
    });
    expect(result.verdict).toBe("conditional");
    expect(result.conditions.map((condition) => condition.type)).toContain(
      "dangerous_dog_limit",
    );
  });

  it("preserves an assistance-animal exception without treating it as ordinary access", () => {
    const result = assess({ etcAcmpyInfo: "일반 반려동물 동반 불가, 안내견은 가능" });
    expect(result.verdict).toBe("not_allowed");
    expect(result.conditions.map((condition) => condition.type)).toContain(
      "assistance_animal_exception",
    );
  });

  it("marks missing primary data with usable fallback as partial", () => {
    const result = evaluateTourPetAccess(
      trustedInput({
        primaryStatus: "unavailable",
        fallback: fallbackEvidence("반려동물 동반 가능"),
      }),
    );
    expect(result).toMatchObject({
      verdict: "allowed",
      evaluationState: "partial",
      confidence: "medium",
    });
    expect(result.reasonCodes).toContain("secondary_fallback_used");
  });

  it("does not mark fallback-only evidence complete when primary succeeded empty", () => {
    const result = evaluateTourPetAccess(
      trustedInput({ fallback: fallbackEvidence("반려동물 동반 가능") }),
    );
    expect(result).toMatchObject({
      verdict: "allowed",
      evaluationState: "insufficient_evidence",
      confidence: "medium",
    });
  });

  it("never turns provider failure without fallback into not allowed", () => {
    const result = evaluateTourPetAccess(
      trustedInput({ primaryStatus: "unavailable", fallbackStatus: "unavailable" }),
    );
    expect(result).toMatchObject({ verdict: "unknown", evaluationState: "unavailable" });
    expect(result.sources[0].status).toBe("unavailable");
  });

  it("distinguishes a valid empty response from provider failure", () => {
    const result = assess({});
    expect(result).toMatchObject({
      verdict: "unknown",
      evaluationState: "insufficient_evidence",
    });
    expect(result.sources[0].status).toBe("empty");
  });

  it("keeps an unknown structured code unknown", () => {
    const result = assess({ acmpyTypeCd: "999" });
    expect(result.verdict).toBe("unknown");
    expect(result.reasonCodes).toContain("unknown_structured_code");
  });

  it("documents the one verified structured-code mapping", () => {
    const result = assess({ acmpyTypeCd: "전구역 동반가능" });
    expect(result.evidence[0]).toMatchObject({
      assertion: "allows",
      scope: "whole_place",
      priority: 1,
    });
    expect(result.sources[0].status).toBe("available");
  });

  it("turns broad allowance plus a compatible condition into conditional", () => {
    expect(
      assess({ acmpyTypeCd: "전구역 동반가능", acmpyNeedMtr: "목줄 착용" }),
    ).toMatchObject({ verdict: "conditional", confidence: "high" });
  });

  it("surfaces whole-place allowance and denial as an unknown conflict", () => {
    const result = assess({
      acmpyTypeCd: "전구역 동반가능",
      etcAcmpyInfo: "반려동물 동반 불가",
    });
    expect(result.verdict).toBe("unknown");
    expect(result.conflicts).toHaveLength(1);
  });

  it("surfaces a same-scope textual contradiction", () => {
    const result = assess({
      acmpyPsblCpam: "반려동물 동반 가능",
      etcAcmpyInfo: "반려동물 동반 불가",
    });
    expect(result.verdict).toBe("unknown");
    expect(result.reasonCodes).toContain("same_scope_conflict");
  });

  it("does not make scope-resolvable indoor and outdoor evidence a conflict", () => {
    const result = assess({ etcAcmpyInfo: "실내 동반 불가하지만 야외 동반 가능" });
    expect(result.verdict).toBe("conditional");
    expect(result.conflicts).toEqual([]);
  });

  it("deduplicates identical conditions while retaining evidence references", () => {
    const result = assess({
      acmpyNeedMtr: "목줄 착용 필수",
      etcAcmpyInfo: "반려동물 동반 가능. 목줄 착용 필수",
    });
    const leash = result.conditions.filter((condition) => condition.type === "leash_required");
    expect(leash).toHaveLength(1);
    expect(leash[0].evidenceIds.length).toBeGreaterThan(1);
  });

  it("keeps semantically identical conditions separate across scopes", () => {
    const result = assess({
      acmpyNeedMtr: "실내에서는 목줄 착용 필수. 야외에서는 목줄 착용 필수",
    });
    const leash = result.conditions.filter(
      (condition) => condition.type === "leash_required",
    );
    expect(leash).toHaveLength(2);
    expect(new Set(leash.map((condition) => condition.scope))).toEqual(
      new Set(["indoor", "outdoor"]),
    );
  });

  it("keeps multiple provider fields traceable", () => {
    const result = assess({
      acmpyPsblCpam: "반려동물 동반 가능",
      acmpyNeedMtr: "목줄 착용 필수",
    });
    expect(new Set(result.evidence.map((item) => item.field))).toEqual(
      new Set(["acmpyPsblCpam", "acmpyNeedMtr"]),
    );
  });

  it("does not fabricate meaning from an unknown number", () => {
    const result = assess({ acmpyPsblCpam: "15" });
    expect(result.verdict).toBe("unknown");
    expect(result.conditions).toEqual([]);
  });

  it("returns identical semantic output for identical input", () => {
    const input = trustedInput({ fields: { etcAcmpyInfo: "반려동물 동반 가능" } });
    expect(evaluateTourPetAccess(input)).toEqual(evaluateTourPetAccess(input));
  });

  it("returns the ruleset version", () => {
    expect(assess({}).rulesetVersion).toBe("2");
  });

  it("bounds evidence, condition, conflict, and verification arrays", () => {
    const repeated = Array.from(
      { length: 40 },
      (_, index) => `반려동물 동반 ${index % 2 === 0 ? "가능" : "불가"}. 목줄 필수`,
    ).join("\n");
    const result = assess({ etcAcmpyInfo: repeated });
    expect(result.evidence.length).toBeLessThanOrEqual(PET_ACCESS_LIMITS.evidence);
    expect(result.conditions.length).toBeLessThanOrEqual(PET_ACCESS_LIMITS.conditions);
    expect(result.conflicts.length).toBeLessThanOrEqual(PET_ACCESS_LIMITS.conflicts);
    expect(result.verificationItems.length).toBeLessThanOrEqual(
      PET_ACCESS_LIMITS.verificationItems,
    );
  });

  it("does not return raw HTML in rendered evidence", () => {
    const result = assess({ etcAcmpyInfo: "<script>alert(1)</script><b>반려동물 동반 가능</b>" });
    expect(result.evidence[0].originalText).not.toMatch(/[<>]/);
    expect(result.verdict).toBe("allowed");
  });

  it("does not accept unsupported legacy provider records", () => {
    const result = evaluateTourPetAccess(
      trustedInput({
        providerContentTypeId: "75",
        fields: { etcAcmpyInfo: "반려동물 동반 가능" },
      }),
    );
    expect(result).toMatchObject({ verdict: "unknown", evaluationState: "not_applicable" });
    expect(result.evidence).toEqual([]);
    expect(result.sources[0].status).toBe("available");
  });

  it("ignores a fallback field that does not match the provider-owned type", () => {
    const result = evaluateTourPetAccess(
      trustedInput({
        primaryStatus: "unavailable",
        providerContentTypeId: "38",
        fallback: fallbackEvidence("반려동물 동반 가능", "chkpetculture"),
      }),
    );
    expect(result).toMatchObject({ verdict: "unknown", evaluationState: "unavailable" });
  });

  it("cannot be changed by a pet-themed title", () => {
    const input = { ...trustedInput(), title: "애견 동반 카페" } as TrustedTourPetAccessInput;
    expect(evaluateTourPetAccess(input).verdict).toBe("unknown");
  });

  it("cannot be changed by Tourism category alone", () => {
    const input = { ...trustedInput(), category: "food" } as TrustedTourPetAccessInput;
    expect(evaluateTourPetAccess(input).verdict).toBe("unknown");
  });

  it("cannot be changed by licensing match state", () => {
    const base = trustedInput({ fields: { etcAcmpyInfo: "반려동물 동반 가능" } });
    const high = { ...base, licensing: { matchState: "matched_high" } } as TrustedTourPetAccessInput;
    const unavailable = { ...base, licensing: { matchState: "unavailable" } } as TrustedTourPetAccessInput;
    expect(evaluateTourPetAccess(high)).toEqual(evaluateTourPetAccess(unavailable));
  });

  it("cannot be changed by licensing operating state", () => {
    const base = trustedInput({ fields: { etcAcmpyInfo: "반려동물 동반 불가" } });
    const active = { ...base, operatingState: "active" } as TrustedTourPetAccessInput;
    const closed = { ...base, operatingState: "closed" } as TrustedTourPetAccessInput;
    expect(evaluateTourPetAccess(active)).toEqual(evaluateTourPetAccess(closed));
  });

  it("does not use unsupported certainty or certification claims in the UI", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/places/pet-access-assessment-panel.tsx"),
      "utf8",
    );
    expect(source).not.toContain("확정 입장 가능");
    expect(source).not.toContain("100% 동반 가능");
    expect(source).not.toContain("인증 완료");
  });
});
