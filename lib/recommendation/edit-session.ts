import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type {
  RouteOptimizationCandidate,
  RouteOptimizationInput,
  RouteOptimizationTripRequest,
} from "@/lib/recommendation/types/route-optimizer";
import type { TravelNode, TravelTimeTemporalBasis } from "@/lib/travel/types";
import type { ProductRouteV1, RecommendedRouteStopV1 } from "@/types/recommendation";

const EDIT_SESSION_TTL_MS = 20 * 60 * 1_000;
const EDIT_SESSION_VERSION = "manual-route-edit-session-v1";
const MAX_EDIT_SESSION_TOKEN_LENGTH = 256_000;

export interface ManualEditCandidate {
  node: TravelNode;
  dwellDurationMinutes: number;
  schedule: RouteOptimizationCandidate["schedule"];
  originalStop: RecommendedRouteStopV1;
}

export interface EditSessionPayload {
  version: typeof EDIT_SESSION_VERSION;
  expiresAt: number;
  departure: TravelNode;
  tripRequest: RouteOptimizationTripRequest;
  searchTemporalBasis: TravelTimeTemporalBasis;
  candidates: ManualEditCandidate[];
}

function editSessionSigningKey(explicit?: string): Buffer {
  const configured = explicit?.trim() || process.env.ROUTE_EDIT_SESSION_SECRET?.trim();
  const providerMaterial = [
    process.env.TOUR_API_SERVICE_KEY?.trim(),
    process.env.KAKAO_REST_API_KEY?.trim(),
  ];
  const material = configured ||
    (providerMaterial.every(Boolean) ? providerMaterial.join("\0") : "");
  if (!material) {
    throw new TypeError("Route edit-session signing material is unavailable.");
  }
  return createHash("sha256")
    .update(`${EDIT_SESSION_VERSION}\0`, "utf8")
    .update(material, "utf8")
    .digest();
}

function signEditSession(payload: EditSessionPayload, secret?: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", editSessionSigningKey(secret))
    .update(encoded, "utf8")
    .digest("base64url");
  return `v1.${encoded}.${signature}`;
}

export function parseEditSession(
  token: string,
  nowMs: number,
  secret?: string,
): EditSessionPayload | null {
  if (!token.startsWith("v1.") || token.length > MAX_EDIT_SESSION_TOKEN_LENGTH) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const encoded = parts[1]!;
  const supplied = Buffer.from(parts[2]!, "base64url");
  const expected = createHmac("sha256", editSessionSigningKey(secret))
    .update(encoded, "utf8")
    .digest();
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<EditSessionPayload>;
    if (
      parsed.version !== EDIT_SESSION_VERSION ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= nowMs ||
      !parsed.departure ||
      !parsed.tripRequest ||
      typeof parsed.searchTemporalBasis !== "string" ||
      !Array.isArray(parsed.candidates) ||
      parsed.candidates.length === 0 ||
      parsed.candidates.length > 15 ||
      parsed.candidates.some(
        (candidate) =>
          !candidate ||
          typeof candidate.node?.id !== "string" ||
          typeof candidate.dwellDurationMinutes !== "number" ||
          !candidate.schedule ||
          candidate.originalStop?.placeId !== candidate.node.id,
      ) ||
      new Set(parsed.candidates.map(({ node }) => node.id)).size !==
        parsed.candidates.length
    ) {
      return null;
    }
    return parsed as EditSessionPayload;
  } catch {
    return null;
  }
}

export function createEditSessionId(
  input: RouteOptimizationInput,
  routes: readonly ProductRouteV1[],
  searchTemporalBasis: TravelTimeTemporalBasis,
  nowMs: number,
  secret?: string,
): string {
  const byId = new Map(input.candidates.map((candidate) => [candidate.node.id, candidate]));
  const originalStops = new Map(
    routes.flatMap(({ stops }) => stops).map((stop) => [stop.placeId, stop]),
  );
  const candidates = [...originalStops].map(([placeId, originalStop]) => {
    const candidate = byId.get(placeId);
    if (!candidate) throw new TypeError("Editable route stop is missing its candidate.");
    return {
      node: candidate.node,
      dwellDurationMinutes: candidate.dwellDurationMinutes,
      schedule: candidate.schedule,
      originalStop,
    } satisfies ManualEditCandidate;
  });
  return signEditSession(
    {
      version: EDIT_SESSION_VERSION,
      expiresAt: nowMs + EDIT_SESSION_TTL_MS,
      departure: input.departure,
      tripRequest: input.tripRequest,
      searchTemporalBasis,
      candidates,
    },
    secret,
  );
}
