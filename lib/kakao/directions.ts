import { ConfigurationRequiredError, ProviderResponseError } from "@/lib/shared/errors";
import { z } from "zod";
import type { Coordinates } from "@/types/place";

const directionsResponseSchema = z.object({
  routes: z.array(
    z.object({
      result_code: z.number(),
      summary: z
        .object({
          distance: z.number(),
          duration: z.number(),
        })
        .optional(),
    }),
  ),
});

export async function getDirections(origin: Coordinates, destination: Coordinates) {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) throw new ConfigurationRequiredError("KAKAO_REST_API_KEY가 없습니다.");

  const url = new URL("https://apis-navi.kakaomobility.com/v1/directions");
  url.searchParams.set("origin", `${origin.longitude},${origin.latitude}`);
  url.searchParams.set("destination", `${destination.longitude},${destination.latitude}`);
  const response = await fetch(url, {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new ProviderResponseError("카카오 길찾기 요청에 실패했습니다.");

  const parsed = directionsResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new ProviderResponseError("길찾기 응답이 올바르지 않습니다.");
  return parsed.data;
}
