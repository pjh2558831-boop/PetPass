import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      PETPASS_E2E_UPSTREAM_MOCK: "1",
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
