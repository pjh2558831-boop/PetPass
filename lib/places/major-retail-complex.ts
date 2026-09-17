export interface RetailComplexPlace {
  name?: string | null;
  address?: string | null;
  category?: string | null;
}

export type MajorRetailComplexClassification = "parent" | "tenant" | "independent";

const FACILITY = "(?:롯데(?:프리미엄)?아울렛|롯데백화점|현대(?:프리미엄)?아울렛|현대백화점|신세계백화점)";
const FACILITY_MENTION = new RegExp(FACILITY, "u");
const PARENT_NAME = new RegExp(`^${FACILITY}(?:\\s*[^\\s]+(?:본점|점))?$`, "u");

export function classifyMajorRetailComplex(
  place: RetailComplexPlace,
): MajorRetailComplexClassification {
  const name = (place.name ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
  const address = (place.address ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (place.category === "shopping" && PARENT_NAME.test(name)) return "parent";
  return FACILITY_MENTION.test(`${name} ${address}`) ? "tenant" : "independent";
}

export function removeMajorRetailComplexTenants<T extends RetailComplexPlace>(
  places: readonly T[],
): T[] {
  const parents = new Set<string>();
  return places.filter((place) => {
    const classification = classifyMajorRetailComplex(place);
    if (classification === "tenant") return false;
    if (classification !== "parent") return true;
    const key = (place.name ?? "").normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
    if (parents.has(key)) return false;
    parents.add(key);
    return true;
  });
}
