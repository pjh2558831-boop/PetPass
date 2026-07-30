import { getDirections } from "@/lib/kakao/directions";
import {
  apiFailure,
  apiSuccess,
  providerErrorResponse,
} from "@/lib/shared/api-response";
import { coordinatesSchema } from "@/lib/shared/domain-schemas";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const origin = coordinatesSchema.safeParse({
    latitude: Number(params.get("originLat")),
    longitude: Number(params.get("originLng")),
  });
  const destination = coordinatesSchema.safeParse({
    latitude: Number(params.get("destinationLat")),
    longitude: Number(params.get("destinationLng")),
  });

  if (!origin.success || !destination.success) {
    return apiFailure(
      {
        code: "INVALID_REQUEST",
        message: "유효한 출발지와 도착지 좌표가 필요합니다.",
        retryable: false,
      },
      400,
    );
  }

  try {
    return apiSuccess(await getDirections(origin.data, destination.data));
  } catch (error) {
    return providerErrorResponse(error);
  }
}
