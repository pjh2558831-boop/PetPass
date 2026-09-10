import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  workers: 1,
  retries: 0,
  use: { ...base.use, baseURL: "http://localhost:3194" },
  webServer: {
    ...(Array.isArray(base.webServer) ? base.webServer[0] : base.webServer),
    command: "node node_modules/next/dist/bin/next start -p 3194",
    url: "http://localhost:3194",
    reuseExistingServer: true,
  },
});
