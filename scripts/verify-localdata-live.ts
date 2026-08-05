import { existsSync } from "node:fs";
import { LocalDataClient } from "@/lib/licenses/client";
import { LocalDataProviderClient } from "@/lib/licenses/provider";
import { FoodLicenseMatchingService } from "@/lib/licenses/service";
import { KoreaTourismService } from "@/lib/tour-api/service";

if (!process.env.LOCALDATA_SERVICE_KEY && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

async function main() {
  if (
    !process.env.LOCALDATA_SERVICE_KEY ||
    !process.env.LOCALDATA_GENERAL_RESTAURANTS_ENDPOINT ||
    !process.env.LOCALDATA_REST_CAFES_ENDPOINT ||
    !process.env.TOUR_API_SERVICE_KEY
  ) {
    throw new Error("CONFIGURATION_REQUIRED");
  }

  const provider = new LocalDataProviderClient();
  const search = new LocalDataClient(provider);
  const matcher = new FoodLicenseMatchingService(search);
  const tourism = new KoreaTourismService();
  const list = await tourism.listPlaces({
    regionCode: "26",
    contentTypeId: "39",
    page: 1,
    pageSize: 10,
  });
  const place = list.places.find(
    (candidate) => candidate.category === "food" && candidate.contentTypeId === "39",
  );

  if (!place) {
    const [general, cafes] = await Promise.all([
      provider.request("general_restaurants", {
        pageNo: "1",
        numOfRows: "1",
        returnType: "json",
      }),
      provider.request("rest_cafes", {
        pageNo: "1",
        numOfRows: "1",
        returnType: "json",
      }),
    ]);
    console.log(`LIVE_TOUR_FOOD_COUNT=${list.places.length}`);
    console.log("LIVE_LOCALDATA_GENERAL_PARSED=true");
    console.log("LIVE_LOCALDATA_CAFE_PARSED=true");
    console.log(`LIVE_LOCALDATA_GENERAL_SAMPLE_COUNT=${general.items.length}`);
    console.log(`LIVE_LOCALDATA_CAFE_SAMPLE_COUNT=${cafes.items.length}`);
    console.log("LIVE_LICENSE_MATCH_STATE=not_applicable");
    console.log("LIVE_LICENSE_REASON=no_supported_tourism_food_record");
    return;
  }

  const detail = await tourism.getPlaceDetail(place.contentId, "39");
  const businessName = detail.summary.title;
  if (!businessName) throw new Error("TRUSTED_TITLE_REQUIRED");
  const [general, cafes, match] = await Promise.all([
    search.search({ dataset: "general_restaurants", businessName }),
    search.search({ dataset: "rest_cafes", businessName }),
    matcher.matchTourPlace(detail),
  ]);
  console.log(`LIVE_TOUR_FOOD_COUNT=${list.places.length}`);
  console.log(`LIVE_TOUR_FOOD_TITLE=${businessName}`);
  console.log("LIVE_LOCALDATA_GENERAL_PARSED=true");
  console.log("LIVE_LOCALDATA_CAFE_PARSED=true");
  console.log(`LIVE_LOCALDATA_GENERAL_CANDIDATES=${general.records.length}`);
  console.log(`LIVE_LOCALDATA_CAFE_CANDIDATES=${cafes.records.length}`);
  console.log(`LIVE_LICENSE_MATCH_STATE=${match.matchState}`);
  console.log(`LIVE_LICENSE_MATCH_SCORE=${match.totalScore ?? "none"}`);
  console.log(`LIVE_LICENSE_MATCH_REASONS=${match.reasons.slice(0, 3).join(" | ")}`);
}

main().catch((error: unknown) => {
  console.error(
    `LIVE_LOCALDATA_STATUS=failed:${error instanceof Error ? error.name : "UNKNOWN"}`,
  );
  process.exitCode = 1;
});
