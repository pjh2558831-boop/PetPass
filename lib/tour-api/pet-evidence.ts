import "server-only";

import { normalizePetPolicyEvidence } from "@/lib/tour-api/normalizers";
import type { TourItem } from "@/lib/tour-api/schemas";
import type {
  NormalizedPetEvidence,
  PetEvidenceAvailability,
  TourPetPolicyFieldName,
  TourPetPolicyFields,
} from "@/types/place";

export type {
  NormalizedPetEvidence,
  PetEvidenceAvailability,
} from "@/types/place";

export const TOUR_PET_POLICY_FIELD_NAMES = [
  "acmpyTypeCd",
  "acmpyPsblCpam",
  "acmpyNeedMtr",
  "etcAcmpyInfo",
  "relaAcdntRiskMtr",
  "relaPosesFclty",
  "relaFrnshPrdlst",
  "relaPurcPrdlst",
  "relaRntlPrdlst",
] as const satisfies readonly TourPetPolicyFieldName[];

function emptyFields(): TourPetPolicyFields {
  return Object.fromEntries(
    TOUR_PET_POLICY_FIELD_NAMES.map((field) => [field, null]),
  ) as unknown as TourPetPolicyFields;
}

export function normalizePetEvidence(
  item: TourItem | null,
  context: {
    contentId: string;
    retrievedAt: string;
    providerAvailable?: boolean;
  },
): NormalizedPetEvidence {
  if (context.providerAvailable === false) {
    return {
      availability: "provider_unavailable",
      fields: emptyFields(),
      sourceFields: [],
      emptyFieldNames: [],
      absentFieldNames: [...TOUR_PET_POLICY_FIELD_NAMES],
      warningCodes: ["pet_detail_provider_unavailable"],
    };
  }

  if (!item) {
    return {
      availability: "absent",
      fields: emptyFields(),
      sourceFields: [],
      emptyFieldNames: [],
      absentFieldNames: [...TOUR_PET_POLICY_FIELD_NAMES],
      warningCodes: ["pet_detail_item_absent"],
    };
  }

  const evidence = normalizePetPolicyEvidence(item, context);
  const fields = evidence?.fields ?? emptyFields();
  const sourceFields: NormalizedPetEvidence["sourceFields"] = [];
  const emptyFieldNames: TourPetPolicyFieldName[] = [];
  const absentFieldNames: TourPetPolicyFieldName[] = [];

  for (const field of TOUR_PET_POLICY_FIELD_NAMES) {
    const rawValue = item[field];
    const normalizedValue = fields[field];
    if (normalizedValue) {
      sourceFields.push({ field, value: normalizedValue });
    } else if (rawValue === undefined) {
      absentFieldNames.push(field);
    } else {
      emptyFieldNames.push(field);
    }
  }

  const availability: PetEvidenceAvailability =
    sourceFields.length === 0
      ? "empty"
      : sourceFields.length === TOUR_PET_POLICY_FIELD_NAMES.length
        ? "usable"
        : "partial";

  return {
    availability,
    fields,
    sourceFields,
    emptyFieldNames,
    absentFieldNames,
    warningCodes:
      availability === "empty"
        ? ["pet_detail_fields_empty"]
        : availability === "partial"
          ? ["pet_detail_fields_partial"]
          : [],
  };
}
