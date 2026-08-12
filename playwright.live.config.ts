import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const LIVE_FLAGS = [
  "RUN_LIVE_TOUR_E2E",
  "RUN_LIVE_KAKAO_E2E",
  "RUN_LIVE_PROVIDER_E2E",
] as const;

if (!LIVE_FLAGS.some((name) => process.env[name] === "1")) {
  throw new Error(
    `Live verification is opt-in. Set one of: ${LIVE_FLAGS.join(", ")}`,
  );
}

const liveTestMatch = [
  ...(process.env.RUN_LIVE_TOUR_E2E === "1" ? ["**/tour-live.spec.ts"] : []),
  ...(process.env.RUN_LIVE_KAKAO_E2E === "1"
    ? ["**/kakao-map-live.spec.ts"]
    : []),
  ...(process.env.RUN_LIVE_PROVIDER_E2E === "1"
    ? ["**/provider-live.spec.ts"]
    : []),
];

if (!existsSync(".env.local")) {
  throw new Error("Live verification requires an ignored .env.local file.");
}

process.loadEnvFile(".env.local");
delete process.env.PETPASS_E2E_UPSTREAM_MOCK;

const REQUIRED_VARIABLES = [
  "TOUR_API_SERVICE_KEY",
  "TOUR_API_BASE_URL",
  "KAKAO_REST_API_KEY",
  "NEXT_PUBLIC_KAKAO_MAP_JS_KEY",
] as const;
const missingVariables = REQUIRED_VARIABLES.filter(
  (name) => !process.env[name]?.trim(),
);
if (missingVariables.length > 0) {
  throw new Error(
    `Live verification is missing required variables: ${missingVariables.join(", ")}`,
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: liveTestMatch,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: join(tmpdir(), "petpass-live-test-results"),
  use: {
    baseURL: "http://localhost:3000",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "live-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
