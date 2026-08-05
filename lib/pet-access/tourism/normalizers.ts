import { PET_ACCESS_LIMITS } from "@/lib/pet-access/tourism/constants";

const BASIC_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi,
    (entity, code: string) => {
      const normalized = code.toLowerCase();
      if (normalized.startsWith("#x")) {
        const point = Number.parseInt(normalized.slice(2), 16);
        return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
      }
      if (normalized.startsWith("#")) {
        const point = Number.parseInt(normalized.slice(1), 10);
        return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
      }
      return BASIC_ENTITIES[normalized] ?? entity;
    },
  );
}

function takeCharacters(value: string, maximum: number): string {
  return Array.from(value).slice(0, maximum).join("");
}

function stripFormatting(value: string): string {
  return value
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(?:p|div|li)\s*>/gi, "\n")
    .replace(/<\s*(?:p|div|li)(?:\s[^>]*)?>/gi, "\n")
    .replace(/<[^>]*>/g, " ");
}

export interface NormalizedProviderText {
  originalText: string;
  normalizedText: string;
  truncated: boolean;
}

export function normalizeProviderPolicyText(
  input: string | null | undefined,
): NormalizedProviderText | null {
  if (!input) return null;
  const decoded = stripFormatting(decodeHtmlEntities(input)).normalize("NFKC");
  const cleaned = decoded
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (!cleaned) return null;
  const originalText = takeCharacters(
    cleaned,
    PET_ACCESS_LIMITS.sourceFieldCharacters,
  );
  return {
    originalText,
    normalizedText: originalText.toLocaleLowerCase("ko-KR"),
    truncated: Array.from(cleaned).length > PET_ACCESS_LIMITS.sourceFieldCharacters,
  };
}

export interface NormalizedPolicyClause {
  originalText: string;
  normalizedText: string;
}

export function splitPolicyClauses(
  input: NormalizedProviderText,
): NormalizedPolicyClause[] {
  const withBoundaries = input.originalText
    .replace(/(?:^|\n)\s*[-*•·▪◦※]\s*/g, "\n")
    .replace(/\s*(?:하지만|그러나|반면)\s*/g, "\n")
    .replace(/[,，]\s*(?=(?:실내|실외|야외|테라스|일반|맹견|반려|애완|일부|전체|전구역|소형|중형|대형))/g, "\n");

  return withBoundaries
    .split(/\n+|[;；]+|(?<=[.!?。])\s+/u)
    .map((clause) => clause.trim().replace(/^[\-–—•·▪◦※]\s*/, ""))
    .filter(Boolean)
    .slice(0, PET_ACCESS_LIMITS.clausesPerField)
    .map((clause) => {
      const originalText = takeCharacters(
        clause,
        PET_ACCESS_LIMITS.evidenceWordingCharacters,
      );
      return {
        originalText,
        normalizedText: originalText.toLocaleLowerCase("ko-KR"),
      };
    });
}
