import { ConfigurationRequiredError, ProviderResponseError } from "@/lib/shared/errors";
import { z } from "zod";

const geocodeResponseSchema = z.object({
  documents: z.array(
    z.object({
      address_name: z.string(),
      x: z.coerce.number(),
      y: z.coerce.number(),
    }),
  ),
});

export async function geocodeAddress(address: string) {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) throw new ConfigurationRequiredError("KAKAO_REST_API_KEY가 없습니다.");

  const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  url.searchParams.set("query", address);
  const response = await fetch(url, {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new ProviderResponseError("카카오 주소 검색에 실패했습니다.");

  const parsed = geocodeResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new ProviderResponseError("주소 검색 응답이 올바르지 않습니다.");
  return parsed.data.documents;
}
