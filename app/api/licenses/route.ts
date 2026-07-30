import { createAdministrativeLicenseClient } from "@/lib/licenses/client";
import {
  apiFailure,
  apiSuccess,
  providerErrorResponse,
} from "@/lib/shared/api-response";
import { z } from "zod";

const querySchema = z.object({
  businessName: z.string().min(1),
  address: z.string().min(1),
  category: z.enum(["RESTAURANT", "ACCOMMODATION"]),
});

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    businessName: params.get("businessName"),
    address: params.get("address"),
    category: params.get("category"),
  });

  if (!parsed.success) {
    return apiFailure(
      {
        code: "INVALID_REQUEST",
        message: "업소명, 주소, 대상 업종이 필요합니다.",
        retryable: false,
      },
      400,
    );
  }

  try {
    const client = createAdministrativeLicenseClient();
    return apiSuccess(await client.lookup(parsed.data));
  } catch (error) {
    return providerErrorResponse(error);
  }
}
