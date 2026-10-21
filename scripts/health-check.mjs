import { appendFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

export const HEALTH_URL = 'https://jipjigi-khyun.vercel.app/api/health';
const EXPECTED = {
  status: 'ok',
  database: 'ready',
  databaseStore: 'neon',
  rateLimitStore: 'redis',
  rateLimitReady: true,
};

export async function probeHealth(url, { fetchImpl = fetch, timeoutMs = 10_000, now = Date.now } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  let httpStatus = null;
  try {
    const response = await fetchImpl(url, {
      signal,
      redirect: 'manual',
      headers: { accept: 'application/json', 'cache-control': 'no-cache' },
    });
    httpStatus = response.status;
    if (httpStatus !== 200) return { ok: false, httpStatus, reason: `HTTP ${httpStatus}` };
    if (!response.headers.get('content-type')?.includes('application/json')) {
      return { ok: false, httpStatus, reason: 'Expected JSON response' };
    }
    const body = await response.json();
    const invalid = Object.entries(EXPECTED).filter(([key, value]) => body?.[key] !== value).map(([key]) => key);
    if (invalid.length) return { ok: false, httpStatus, reason: `Unhealthy fields: ${invalid.join(', ')}` };
    const age = now() - Date.parse(body.timestamp);
    if (!Number.isFinite(age) || age < -60_000 || age > 300_000) {
      return { ok: false, httpStatus, reason: 'Missing or stale health timestamp' };
    }
    return { ok: true, httpStatus, reason: 'Neon and Redis ready' };
  } catch (error) {
    // Never copy remote bodies, endpoint credentials, or raw exception messages into public logs/issues.
    const reason = signal.aborted ? 'Request timed out' : error instanceof SyntaxError ? 'Invalid JSON response' : 'Network request failed';
    return { ok: false, httpStatus, reason };
  }
}

export async function checkHealth({ url = HEALTH_URL, attempts = 3, delayMs = 10_000, sleepImpl = sleep, ...probeOptions } = {}) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5) throw new Error('Invalid attempt count');
  const observations = [];
  for (let attempt = 0; attempt < attempts; attempt++) {
    const observation = await probeHealth(url, probeOptions);
    observations.push(observation);
    if (observation.ok) break;
    if (attempt < attempts - 1) await sleepImpl(delayMs);
  }
  return { ok: observations.at(-1).ok, url, checkedAt: new Date().toISOString(), observations };
}

export function healthSummary(result) {
  return [
    `## Production health: ${result.ok ? 'PASS' : 'FAIL'}`,
    `- Endpoint: ${result.url}`,
    `- Checked at: ${result.checkedAt}`,
    ...result.observations.map((item, index) => `- Attempt ${index + 1}: ${item.reason}`),
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await checkHealth();
  if (process.env.HEALTH_RESULT_PATH) await writeFile(process.env.HEALTH_RESULT_PATH, JSON.stringify(result), { mode: 0o600 });
  const summary = healthSummary(result);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  if (!result.ok) process.exitCode = 1;
}
