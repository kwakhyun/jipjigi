import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const webDirectory = fileURLToPath(new URL("..", import.meta.url));
const standaloneDirectory = path.join(webDirectory, ".next/standalone/apps/web");
const entrypoint = path.join(standaloneDirectory, "server.js");
if (!existsSync(path.join(webDirectory, ".next/BUILD_ID")) || !existsSync(entrypoint)) {
  throw new Error("Run pnpm build before the production E2E tests.");
}
// Match the Docker runtime: Next.js traces server files but intentionally
// leaves public assets and static chunks for the deployer to copy.
cpSync(path.join(webDirectory, "public"), path.join(standaloneDirectory, "public"), { recursive: true });
cpSync(path.join(webDirectory, ".next/static"), path.join(standaloneDirectory, ".next/static"), { recursive: true });
const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "jipjigi-web-e2e-"));
const server = spawn(process.execPath, [entrypoint], {
  cwd: standaloneDirectory,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    TZ: "UTC",
    HOSTNAME: "localhost",
    PORT: "3118",
    VERCEL_ENV: "preview",
    DATABASE_URL: "",
    DB_DIR: path.join(temporaryDirectory, "postgres"),
    UPSTASH_REDIS_REST_URL: "",
    UPSTASH_REDIS_REST_TOKEN: "",
    KV_REST_API_URL: "",
    KV_REST_API_TOKEN: "",
    AUTH_SECRET: "jipjigi-local-e2e-only-auth-secret-never-use-in-production",
    MESSAGE_WEBHOOK_SECRET: "jipjigi-local-e2e-only-webhook-secret",
    ALLOW_DEMO_AUTH: "true",
    NEXT_PUBLIC_APP_URL: "http://localhost:3118",
    NEXT_TELEMETRY_DISABLED: "1",
  },
});

const clean = () => rmSync(temporaryDirectory, { recursive: true, force: true });
server.once("error", (error) => { clean(); console.error(error); process.exitCode = 1; });
server.once("exit", (code) => { clean(); process.exitCode = code ?? 0; });
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => server.kill(signal));
