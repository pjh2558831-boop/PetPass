import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: "http://localhost:3195" },
  webServer: {
    ...(Array.isArray(base.webServer) ? base.webServer[0] : base.webServer),
    command: "node node_modules/next/dist/bin/next dev -p 3195",
    url: "http://localhost:3195",
    reuseExistingServer: true,
  },
});
