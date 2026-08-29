import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const statsFile = path.resolve(".next/diagnostics/route-bundle-stats.json");
const routeBudgets = new Map([
  ["/", 170 * 1024],
  ["/login", 170 * 1024],
  ["/rental-management/[district]", 170 * 1024],
  ["/app", 185 * 1024],
  ["/app/contracts", 170 * 1024],
  ["/app/growth", 170 * 1024],
  ["/app/ledger", 170 * 1024],
  ["/app/maintenance", 170 * 1024],
  ["/app/messages", 170 * 1024],
  ["/app/settings", 170 * 1024],
]);

let stats;
try {
  stats = JSON.parse(readFileSync(statsFile, "utf8"));
} catch (error) {
  console.error(`Bundle stats not found at ${statsFile}. Run next build first.`);
  throw error;
}

const results = [];
for (const [route, budget] of routeBudgets) {
  const routeStats = stats.find((entry) => entry.route === route);
  if (!routeStats) {
    results.push({ route, budget, gzipBytes: null, status: "missing" });
    continue;
  }
  const gzipBytes = routeStats.firstLoadChunkPaths.reduce((sum, chunkPath) => {
    const contents = readFileSync(path.resolve(chunkPath));
    return sum + gzipSync(contents, { level: 9 }).byteLength;
  }, 0);
  results.push({
    route,
    budget,
    gzipBytes,
    status: gzipBytes <= budget ? "pass" : "fail",
  });
}

console.table(results.map((result) => ({
  route: result.route,
  "gzip KiB": result.gzipBytes === null ? "-" : (result.gzipBytes / 1024).toFixed(1),
  "budget KiB": (result.budget / 1024).toFixed(0),
  status: result.status,
})));

const failed = results.filter((result) => result.status !== "pass");
if (failed.length) {
  console.error(`Bundle budget failed for ${failed.map((result) => result.route).join(", ")}.`);
  process.exitCode = 1;
} else {
  console.info("All route bundle budgets passed.");
}
