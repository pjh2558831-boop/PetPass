import { geocodeAddress } from "@/lib/kakao/local";
import {
  apiFailure,
  apiSuccess,
  providerErrorResponse,
} from "@/lib/shared/api-response";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address")?.trim();
  if (!address) {
    return apiFailure(
      {
        code: "INVALID_REQUEST",
        message: "검색할 주소가 필요합니다.",
        retryable: false,
      },
      400,
    );
  }

  try {
    return apiSuccess(await geocodeAddress(address));
  } catch (error) {
    return providerErrorResponse(error);
  }
}
