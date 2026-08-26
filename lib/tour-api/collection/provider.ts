import "server-only";

import type {
  KtoCatalogProvider,
  KtoProviderRequestAudit,
} from "@/lib/tour-api/collection/contracts";
import {
  KoreaTourismService,
  type TourRequestObserver,
} from "@/lib/tour-api/service";

export function createKtoCatalogProvider(
  service = new KoreaTourismService(),
): KtoCatalogProvider {
  const requestAudit: KtoProviderRequestAudit = {
    liveProviderCallCount: 0,
    operationCallCounts: {},
  };
  const observe: TourRequestObserver = ({ operation, liveProviderCall }) => {
    if (!liveProviderCall) return;
    requestAudit.liveProviderCallCount += 1;
    requestAudit.operationCallCounts[operation] =
      (requestAudit.operationCallCounts[operation] ?? 0) + 1;
  };
  return {
    async listDistrict(input) {
      return service.listCollectionPlaces({
        regionCode: input.regionCode,
        districtCode: input.districtCode,
        page: input.page,
        pageSize: input.pageSize,
      }, observe);
    },
    getPlaceDetail(contentId, contentTypeId) {
      return service.getCollectionPlaceDetail(contentId, contentTypeId, observe);
    },
    getRequestAudit() {
      return structuredClone(requestAudit);
    },
  };
}
