import { existsSync } from "node:fs";
import { LocalDataClient } from "@/lib/licenses/client";
import { LocalDataProviderClient } from "@/lib/licenses/provider";
import {
  LicenseMatchingService,
  MAX_LOCALDATA_CALLS_PER_DETAIL,
} from "@/lib/licenses/service";
import { KoreaTourismService } from "@/lib/tour-api/service";
import { ACCOMMODATION_LOCALDATA_DATASETS } from "@/types/license";

if (!process.env.LOCALDATA_SERVICE_KEY && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const MAX_LIVE_LOCALDATA_CALLS =
  ACCOMMODATION_LOCALDATA_DATASETS.length +
  MAX_LOCALDATA_CALLS_PER_DETAIL.accommodation;

async function main() {
  const required = [
    "LOCALDATA_SERVICE_KEY",
    "LOCALDATA_LODGINGS_ENDPOINT",
    "LOCALDATA_TOURIST_ACCOMMODATIONS_ENDPOINT",
    "LOCALDATA_TOURIST_PENSIONS_ENDPOINT",
    "TOUR_API_SERVICE_KEY",
    "TOUR_API_BASE_URL",
  ];
  if (required.some((name) => !process.env[name])) {
    throw new Error("CONFIGURATION_REQUIRED");
  }

  // No retries here: three shape checks plus at most six bounded match queries.
  const provider = new LocalDataProviderClient({ transientRetryCount: 0 });
  const parsedSamples = await Promise.all(
    ACCOMMODATION_LOCALDATA_DATASETS.map(async (dataset) => ({
      dataset,
      response: await provider.request(dataset, {
        pageNo: "1",
        numOfRows: "1",
        returnType: "json",
      }),
    })),
  );
  for (const { dataset, response } of parsedSamples) {
    console.log(`LIVE_LOCALDATA_${dataset.toUpperCase()}_PARSED=true`);
    console.log(
      `LIVE_LOCALDATA_${dataset.toUpperCase()}_SAMPLE_COUNT=${response.items.length}`,
    );
  }

  const tourism = new KoreaTourismService();
  const list = await tourism.listPlaces({
    regionCode: "26",
    contentTypeId: "80",
    page: 1,
    pageSize: 3,
  });
  const place = list.places.find(
    (candidate) =>
      candidate.providerContentTypeId === "80" &&
      candidate.category === "accommodation",
  );
  console.log(`LIVE_TOUR_ACCOMMODATION_COUNT=${list.places.length}`);
  console.log(`LIVE_LOCALDATA_MAX_CALLS=${MAX_LIVE_LOCALDATA_CALLS}`);

  if (!place) {
    console.log("LIVE_ACCOMMODATION_MATCH_STATE=not_applicable");
    console.log(
      "LIVE_ACCOMMODATION_REASON=no_current_busan_content_type_80_record",
    );
    return;
  }

  const detail = await tourism.getPlaceDetail(place.contentId, "80");
  const matcher = new LicenseMatchingService(new LocalDataClient(provider));
  const result = await matcher.matchAccommodationPlace(detail);
  for (const datasetResult of result.perDatasetResults) {
    console.log(
      `LIVE_LOCALDATA_${datasetResult.dataset.toUpperCase()}_CANDIDATES=${datasetResult.candidateCount}`,
    );
  }
  console.log(`LIVE_ACCOMMODATION_MATCH_STATE=${result.matchState}`);
  console.log(`LIVE_ACCOMMODATION_MATCH_SCORE=${result.totalScore ?? "none"}`);
  console.log(
    `LIVE_ACCOMMODATION_MATCH_REASONS=${result.reasons.slice(0, 3).join(" | ")}`,
  );
  console.log(
    `LIVE_ACCOMMODATION_COMPATIBLE_MULTI_LICENSE=${result.selectedRecords.length > 1}`,
  );
}

main().catch((error: unknown) => {
  console.error(
    `LIVE_ACCOMMODATION_STATUS=failed:${error instanceof Error ? error.name : "UNKNOWN"}`,
  );
  process.exitCode = 1;
});
