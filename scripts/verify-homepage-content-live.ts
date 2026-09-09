import { loadEnvConfig } from "@next/env";
import { fetchPetNews } from "../lib/naver/news";
import { fetchPetEvents } from "../lib/tour-api/pet-events";
import { TourProviderError } from "../lib/tour-api/errors";

async function main() {
  if (!process.argv.includes("--live")) throw new Error("Explicit --live is required");
  loadEnvConfig(process.cwd());
  console.log({ credentials: Object.fromEntries(["NAVER_API_HUB_ACCESS_KEY_ID", "NAVER_API_HUB_SECRET_KEY", "TOUR_API_SERVICE_KEY"].map(name => [name, Boolean(process.env[name]?.trim())])) });
  let newsRequests = 0;
  const newsFetch: typeof fetch = async (url, init) => { newsRequests++; return fetch(url, init); };
  try {
    const news = await fetchPetNews(process.env, newsFetch, 1);
    // Never print, persist or send actual news text to an AI service.
    console.log({ provider: "naver", gate: "PASS", requests: newsRequests, validItems: news.length, normalRefresh: "SKIPPED_POLICY" });
  } catch (error) {
    console.log({ provider: "naver", gate: "BLOCKED", requests: newsRequests, category: error instanceof TourProviderError ? error.code : "NETWORK" });
  }
  let eventRequests = 0;
  const eventFetch: typeof fetch = async (url, init) => { eventRequests++; return fetch(url, init); };
  try {
    const result = await fetchPetEvents(process.env, eventFetch);
    console.log({ provider: "tourism", gate: "PASS", requests: eventRequests, relevantEvents: result.items.length, renderedCount: Math.min(3, result.items.length), coverageLimited: result.coverageLimited, windowStart: result.windowStart, windowEnd: result.windowEnd });
  } catch (error) {
    console.log({ provider: "tourism", gate: "BLOCKED", requests: eventRequests, category: error instanceof TourProviderError ? error.code : "NETWORK" });
  }
}

void main().catch(() => { console.error("Live verification could not start; details suppressed."); process.exitCode = 1; });
