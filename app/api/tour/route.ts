import { requestTourOperation } from "@/lib/tour-api/client";
import {
  apiFailure,
  apiSuccess,
} from "@/lib/shared/api-response";
import { tourProviderErrorResponse } from "@/lib/tour-api/errors";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const operation = url.searchParams.get("operation");
  if (!operation) {
    return apiFailure(
      {
        code: "INVALID_REQUEST",
        message: "operation 쿼리 값이 필요합니다.",
        retryable: false,
      },
      400,
    );
  }

  const params = Object.fromEntries(url.searchParams.entries());
  delete params.operation;

  try {
    const data = await requestTourOperation(operation, params);
    return apiSuccess(data);
  } catch (error) {
    return tourProviderErrorResponse(error);
  }
}
