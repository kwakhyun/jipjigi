import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // Vercel system variables can bypass Turbo's env allowlist. Never let a
    // test inherit production mode or credentials, including direct Vitest runs.
    env: {
      VERCEL_ENV: "test",
      DATABASE_URL: "",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      KV_REST_API_URL: "",
      KV_REST_API_TOKEN: "",
    },
    include: ["lib/**/*.test.ts", "components/**/*.test.tsx", "app/**/*.test.ts", "app/**/*.test.tsx", "proxy.test.ts"],
    exclude: [".next/**", "node_modules/**"],
    maxWorkers: 2,
    testTimeout: 30_000,
  },
});
