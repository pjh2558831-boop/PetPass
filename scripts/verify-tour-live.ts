import { existsSync } from "node:fs";
import { getDefaultTourService } from "@/lib/tour-api/service";

if (!process.env.TOUR_API_SERVICE_KEY && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

async function main() {
  if (!process.env.TOUR_API_SERVICE_KEY) {
    throw new Error("CONFIGURATION_REQUIRED");
  }

  const service = getDefaultTourService();
  const list = await service.listPlaces({
    regionCode: "26",
    page: 1,
    pageSize: 20,
  });
  if (list.places.length === 0) throw new Error("EMPTY_LIVE_LIST");

  const first = list.places[0];
  const evidence = await service.getPetPolicyEvidence(first.contentId);
  const evidenceFieldCount = Object.values(evidence.fields).filter(Boolean).length;
  const titles = list.places
    .map((place) => place.title)
    .filter((title): title is string => Boolean(title))
    .slice(0, 2);

  console.log(`LIVE_TOUR_PLACE_COUNT=${list.places.length}`);
  console.log(`LIVE_TOUR_TOTAL_COUNT=${list.totalCount}`);
  console.log(`LIVE_TOUR_EXAMPLE_TITLES=${titles.join(" | ")}`);
  console.log(`LIVE_TOUR_PET_EVIDENCE_FIELDS=${evidenceFieldCount}`);
  console.log("LIVE_TOUR_DETAIL_PET_STATUS=success");
}

main().catch((error: unknown) => {
  const code = error instanceof Error ? error.name : "UNKNOWN_ERROR";
  console.error(`LIVE_TOUR_STATUS=failed:${code}`);
  process.exitCode = 1;
});
