import "server-only";

import type { KtoCatalogProvider } from "@/lib/tour-api/collection/contracts";
import { KoreaTourismService } from "@/lib/tour-api/service";

export function createKtoCatalogProvider(
  service = new KoreaTourismService(),
): KtoCatalogProvider {
  return {
    async listDistrict(input) {
      return service.listCollectionPlaces({
        regionCode: input.regionCode,
        districtCode: input.districtCode,
        page: input.page,
        pageSize: input.pageSize,
      });
    },
    getPlaceDetail(contentId, contentTypeId) {
      return service.getCollectionPlaceDetail(contentId, contentTypeId);
    },
  };
}
