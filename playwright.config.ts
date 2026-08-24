import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: "**/*-live.spec.ts",
  fullyParallel: true,
  workers: 2,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "node node_modules/next/dist/bin/next dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      PETPASS_E2E_UPSTREAM_MOCK: "1",
      // Deliberately non-production values keep proxy/auth client construction
      // deterministic without allowing tests to inherit a real Supabase project.
      NEXT_PUBLIC_SUPABASE_URL: "https://petpass-e2e.invalid",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-public-key",
      SUPABASE_SECRET_KEY: "e2e-secret-key",
      NEXT_PUBLIC_KAKAO_MAP_JS_KEY: "e2e-test-key",
      KAKAO_REST_API_KEY: "e2e-test-key",
      KAKAO_STATIC_MAP_THUMBNAILS_ENABLED: "false",
      TOUR_API_SERVICE_KEY: "e2e-test-key",
      TOUR_API_BASE_URL:
        "https://apis.data.go.kr/B551011/KorPetTourService2",
      LOCALDATA_SERVICE_KEY: "e2e-test-key",
      LOCALDATA_GENERAL_RESTAURANTS_ENDPOINT:
        "https://apis.data.go.kr/1741000/general_restaurants",
      LOCALDATA_REST_CAFES_ENDPOINT:
        "https://apis.data.go.kr/1741000/rest_cafes",
      LOCALDATA_LODGINGS_ENDPOINT:
        "https://apis.data.go.kr/1741000/lodgings",
      LOCALDATA_TOURIST_ACCOMMODATIONS_ENDPOINT:
        "https://apis.data.go.kr/1741000/tourist_accommodations/info",
      LOCALDATA_TOURIST_PENSIONS_ENDPOINT:
        "https://apis.data.go.kr/1741000/tourist_pensions",
      ROUTE_ENGINE_V1_ENABLED: "true",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
