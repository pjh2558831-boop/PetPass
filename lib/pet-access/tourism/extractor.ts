import { TOUR_PET_ACCESS_CONDITION_LABELS } from "@/lib/pet-access/tourism/constants";
import type { NormalizedPolicyClause } from "@/lib/pet-access/tourism/normalizers";
import type {
  TourPetAccessAssertion,
  TourPetAccessConditionType,
  TourPetAccessScope,
  TourPetAccessStructuredValue,
} from "@/types/tour-pet-access";

export interface ExtractedCondition {
  subject?: "all" | "dangerous_dog" | "unknown";
  type: TourPetAccessConditionType;
  label: string;
  sourceText: string;
  structuredValue?: TourPetAccessStructuredValue;
  manualConfirmationRecommended: boolean;
}

export interface ExtractedPolicyClause {
  assertion: TourPetAccessAssertion;
  scope: TourPetAccessScope;
  conditions: ExtractedCondition[];
}

const PLACEHOLDER_PATTERN = /^(?:정보\s*없음|해당\s*없음|없음|미제공|-|없습니다|해당사항\s*없음)$/;
const ABSENCE_GUARD_PATTERN =
  /(?:(?:제한|금지|제약).{0,6}(?:없음|없다|없습니다|아님|아니다|않음|않다|않습니다)|(?:불가|불가능).{0,6}(?:아님|아니다|않음|않다|않습니다))/;
const INQUIRY_ONLY_PATTERN =
  /(?:(?:동반|입장|출입|이용|가능)\s*여부.{0,12}(?:문의|확인)|(?:문의|확인).{0,12}(?:동반|입장|출입|이용|가능)\s*여부)/;
const GENERAL_INQUIRY_PATTERN = /(?:문의\s*필요|확인\s*필요|전화\s*문의|사전\s*문의|방문\s*전\s*문의)/;
const ALLOW_PATTERN =
  /(?:(?:반려동물|반려견|애완동물|일반\s*반려견|견종|동물).{0,16}(?:동반|입장|출입|이용).{0,6}(?:가능|허용)|(?:소형견|중형견|대형견).{0,8}(?:가능|허용)|(?:동반|입장|출입).{0,5}(?:가능|허용)|(?:실내|실외|야외|테라스|객실|펫룸|지정\s*구역|일부\s*구역).{0,8}(?:가능|허용)|(?:가능|허용).{0,5}(?:동반|입장|출입))/;
const DENY_PATTERN =
  /(?:(?:동반|입장|출입|이용).{0,5}(?:불가|금지|제한|할\s*수\s*없)|(?:반려동물|반려견|애완동물).{0,14}(?:불가|금지|할\s*수\s*없|허용하지\s*않)|(?:실내|실외|야외|테라스|객실|로비|공용\s*공간).{0,8}(?:불가|금지|제한))/;

function inferScope(text: string): TourPetAccessScope {
  if (/(?:일부|지정|반려동물\s*동반|펫)\s*객실|펫룸/.test(text)) return "selected_room";
  if (/테라스/.test(text)) return "terrace";
  if (/(?:실외|야외)/.test(text)) return "outdoor";
  if (/(?:실내|내부)/.test(text)) return "indoor";
  if (/공용\s*공간/.test(text)) return "common_area";
  if (/로비/.test(text)) return "lobby";
  if (/객실/.test(text)) return "guest_room";
  if (/식당/.test(text)) return "restaurant";
  if (/카페/.test(text)) return "cafe";
  if (/(?:지정|일부)\s*(?:구역|공간|장소)/.test(text)) return "designated_area";
  if (/(?:차량|운송|교통수단)/.test(text)) return "transport";
  if (/(?:전\s*구역|전구역|전체|모든\s*(?:구역|시설))/.test(text)) return "whole_place";
  return "whole_place";
}

function structured(
  value: number,
  unit: TourPetAccessStructuredValue["unit"],
  comparator: TourPetAccessStructuredValue["comparator"],
): TourPetAccessStructuredValue {
  return { value, unit, comparator };
}

function condition(
  type: TourPetAccessConditionType,
  sourceText: string,
  options: {
    structuredValue?: TourPetAccessStructuredValue;
    manualConfirmationRecommended?: boolean;
  } = {},
): ExtractedCondition {
  return {
    type,
    subject: /맹견|위험견/.test(sourceText) ? "dangerous_dog" : "all",
    label: /맹견|위험견/.test(sourceText) ? sourceText : TOUR_PET_ACCESS_CONDITION_LABELS[type],
    sourceText,
    structuredValue: options.structuredValue,
    manualConfirmationRecommended: options.manualConfirmationRecommended ?? false,
  };
}

function extractConditions(clause: NormalizedPolicyClause): ExtractedCondition[] {
  const text = clause.normalizedText;
  const sourceText = clause.originalText;
  const conditions: ExtractedCondition[] = [];
  const add = (
    type: TourPetAccessConditionType,
    options?: Parameters<typeof condition>[2],
  ) => {
    if (!conditions.some((item) => item.type === type)) {
      conditions.push(condition(type, sourceText, options));
    }
  };

  if (/(?:소형견|중소형견|대형견\s*불가|크기\s*제한)/.test(text)) add("size_limit");

  const weight = text.match(/(\d+(?:\.\d+)?)\s*kg\s*(이하|미만|까지|이상)?/i);
  if (weight) {
    add("weight_limit", {
      structuredValue: structured(
        Number(weight[1]),
        "kg",
        weight[2] === "이상" ? "minimum" : weight[2] ? "maximum" : "exact",
      ),
    });
  }

  if (/(?:견종\s*제한|특정\s*견종|대형견\s*불가)/.test(text)) add("breed_limit");
  if (/(?:맹견|위험견)/.test(text) && !/입마개/.test(text)) add("dangerous_dog_limit");
  if (/(?:맹견|위험견).{0,12}(?:동반|입장|출입).{0,5}(?:불가|금지)/.test(text)) add("dangerous_dog_limit");

  const petCount = text.match(/(\d+)\s*(?:마리|두)\s*(이하|미만|까지|이상)?/);
  if (petCount) {
    add("pet_count_limit", {
      structuredValue: structured(
        Number(petCount[1]),
        "pets",
        petCount[2] === "이상" ? "minimum" : petCount[2] ? "maximum" : "exact",
      ),
    });
  }

  if (/목줄/.test(text) && !/목줄.{0,10}(?:필요\s*없|불필요|착용하지\s*않아도)/.test(text)) add("leash_required");
  if (/(?:하네스|가슴줄)/.test(text)) add("harness_required");
  if (/입마개/.test(text) && !/입마개.{0,10}(?:필요\s*없|불필요|착용하지\s*않아도)/.test(text)) add("muzzle_required");
  if (/(?:이동장|케이지|캐리어|반려동물\s*가방)/.test(text)) add("carrier_required");
  if (/(?:반려동물\s*)?유모차/.test(text)) add("stroller_required");
  if (/예방\s*접종/.test(text)) add("vaccination_required");
  if (/(?:증명서|접종\s*서류|확인서|증빙\s*서류)/.test(text)) add("document_required");
  if (/(?:사전\s*)?예약/.test(text)) add("reservation_required");
  if (/(?:사전\s*문의|방문\s*전\s*문의|전화\s*문의|문의\s*필요)/.test(text)) {
    add("advance_inquiry_required", { manualConfirmationRecommended: true });
  }

  const fee = text.match(/(?:추가\s*(?:요금|비용)|동반비|이용료).{0,10}?(\d[\d,]*)\s*원?/);
  if (/(?:추가\s*(?:요금|비용)|동반비|별도\s*요금|유료)/.test(text)) {
    add("fee_required", {
      structuredValue: fee
        ? structured(Number(fee[1].replace(/,/g, "")), "krw", "exact")
        : undefined,
      manualConfirmationRecommended: !fee,
    });
  }
  if (/(?:보증금|예치금)/.test(text)) add("deposit_required");
  if (/(?:지정|일부)\s*(?:구역|공간|장소).{0,8}(?:만|에만|가능)/.test(text)) {
    add("designated_area_only");
  }
  if (/(?:야외|실외|테라스).{0,5}(?:만|에만)\s*(?:동반|입장|출입)?\s*가능/.test(text)) {
    add("outdoor_only");
  }
  if (/(?:실내|내부).{0,8}(?:불가|금지|제한)/.test(text)) add("indoor_restricted");
  if (/(?:일부|지정|반려동물\s*동반|펫)\s*객실|펫룸/.test(text)) {
    add("selected_room_only");
  }
  if (/(?:일부|특정)\s*시설.{0,8}(?:불가|제한|가능)/.test(text)) {
    add("facility_restriction", { manualConfirmationRecommended: true });
  }
  if (/(?:시간\s*제한|특정\s*시간|운영\s*시간.{0,5}(?:내|만))/.test(text)) {
    add("time_restriction", { manualConfirmationRecommended: true });
  }
  if (/보호자.{0,8}(?:동반|감독|관리)/.test(text)) add("owner_supervision");
  if (/(?:배변\s*봉투|배변\s*처리|기저귀|위생\s*수칙)/.test(text)) {
    add("sanitation_requirement");
  }
  if (/(?:안내견|보조견|도우미견)/.test(text)) add("assistance_animal_exception");

  if (
    conditions.length === 0 &&
    /(?:필수|착용|준수|조건|제한)/.test(text) &&
    !ABSENCE_GUARD_PATTERN.test(text)
  ) {
    add("other", { manualConfirmationRecommended: true });
  }

  return conditions;
}

export function extractPolicyClause(
  clause: NormalizedPolicyClause,
): ExtractedPolicyClause {
  const text = clause.normalizedText;
  const conditions = extractConditions(clause);
  const scope = inferScope(text);
  if (PLACEHOLDER_PATTERN.test(text) || ABSENCE_GUARD_PATTERN.test(text)) {
    return { assertion: "unknown", scope, conditions: [] };
  }

  const inquiryOnly = INQUIRY_ONLY_PATTERN.test(text);
  const allowance = ALLOW_PATTERN.test(text) && !inquiryOnly;
  const dangerousDogOnly =
    /(?:맹견|위험견).{0,12}(?:불가|금지|제한)/.test(text) &&
    !/(?:일반\s*반려견|반려동물|애완동물).{0,12}(?:불가|금지)/.test(text);
  const assistanceOnly =
    /(?:안내견|보조견|도우미견).{0,10}(?:가능|허용)/.test(text) &&
    !/(?:일반\s*반려견|반려동물|애완동물).{0,12}(?:가능|허용)/.test(text);
  const denial =
    DENY_PATTERN.test(text) &&
    !ABSENCE_GUARD_PATTERN.test(text) &&
    !dangerousDogOnly;

  if (denial) return { assertion: "denies", scope, conditions };
  if (allowance && !assistanceOnly) return { assertion: "allows", scope, conditions };
  if (inquiryOnly || (GENERAL_INQUIRY_PATTERN.test(text) && !allowance)) {
    return { assertion: "inquiry_only", scope, conditions };
  }
  if (conditions.length > 0) return { assertion: "limits", scope, conditions };
  return { assertion: "unknown", scope, conditions };
}
