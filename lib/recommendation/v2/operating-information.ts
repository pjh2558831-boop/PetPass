import "server-only";

import type { TourPlaceService } from "@/lib/tour-api/service";
import type { ProductRouteV1 } from "@/types/recommendation";

/** Enrich final stops only: opening times are information, not feasibility gates. */
export async function attachRouteOperatingInformation(
  routes: readonly Pick<ProductRouteV1, "stops">[],
  service: Pick<TourPlaceService, "getPlaceScheduleDetail">,
): Promise<void> {
  const stops = routes.flatMap(route => route.stops);
  const unique = [...new Map(stops.map(stop => [stop.placeId, stop])).values()];
  let acceptingResults = true;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  // Optional display data adds at most 2.5 seconds to the completed road route.
  const deadline = new Promise<void>(resolve => {
    timeout = setTimeout(() => { acceptingResults = false; resolve(); }, 2_500);
  });
  // Only final options (at most 15 distinct stops); three concurrent provider lookups.
  const load = async () => {
    for (let index = 0; acceptingResults && index < unique.length; index += 3) {
      await Promise.all(unique.slice(index, index + 3).map(async stop => {
        if (stop.operatingInformationRetrievedAt || stop.source !== "tourism_service2" ||
          stop.category === "shopping" || !service.getPlaceScheduleDetail) return;
        const contentId = stop.providerIdentities?.find(identity => identity.provider === "kto")?.id ??
          stop.placeId.replace(/^tour:/, "");
        if (!/^\d+$/.test(contentId)) return;
        try {
          const detail = await service.getPlaceScheduleDetail(contentId);
          if (!acceptingResults) return;
          stop.operatingInformation = detail.operatingInformation;
          stop.restDayInformation = detail.restDayInformation;
          stop.operatingInformationRetrievedAt = detail.source.retrievedAt;
        } catch {
          // Optional provider data must never turn a valid road route into a failure.
        }
      }));
    }
  };
  try {
    await Promise.race([load(), deadline]);
  } finally {
    acceptingResults = false;
    clearTimeout(timeout);
  }
  const byId = new Map(unique.map(stop => [stop.placeId, stop]));
  for (const stop of stops) {
    const source = byId.get(stop.placeId)!;
    stop.operatingInformation = source.operatingInformation ?? null;
    stop.restDayInformation = source.restDayInformation ?? null;
    stop.operatingInformationRetrievedAt = source.operatingInformationRetrievedAt ?? null;
  }
}
