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
    // Each DB test file starts its own WASM PostgreSQL engine. Avoid competing
    // cold starts on memory-constrained hosts, and keep setup out of the 30s
    // functional-test budget. A standalone cold start was measured at 68s.
    maxWorkers: 1,
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
