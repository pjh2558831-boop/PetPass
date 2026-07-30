import { ConfigurationRequiredError } from "@/lib/shared/errors";
import type { LicenseVerification } from "@/types/license";

export interface LicenseLookupInput {
  businessName: string;
  address: string;
  category: "RESTAURANT" | "ACCOMMODATION";
}

export interface LicenseProvider {
  lookup(input: LicenseLookupInput): Promise<LicenseVerification>;
}

export function createAdministrativeLicenseClient(): LicenseProvider {
  if (!process.env.LOCALDATA_SERVICE_KEY) {
    throw new ConfigurationRequiredError("LOCALDATA_SERVICE_KEY가 설정되지 않았습니다.");
  }

  throw new ConfigurationRequiredError(
    "행정 인허가 데이터셋과 지역별 엔드포인트 선택이 아직 필요합니다.",
  );
}
