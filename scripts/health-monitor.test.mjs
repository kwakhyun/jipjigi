import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { checkHealth, HEALTH_URL, probeHealth } from './health-check.mjs';

const healthy = () => ({ status: 'ok', database: 'ready', databaseStore: 'neon', rateLimitStore: 'redis', rateLimitReady: true, timestamp: new Date().toISOString() });
const json = (body, status = 200) => Response.json(body, { status });

test('requires healthy production dependencies even when HTTP status is 200', async () => {
  for (const [field, invalid] of Object.entries({ status: 'error', database: 'unavailable', databaseStore: 'pglite', rateLimitStore: 'memory', rateLimitReady: false })) {
    const result = await probeHealth(HEALTH_URL, { fetchImpl: async () => json({ ...healthy(), [field]: invalid }) });
    assert.equal(result.ok, false, field);
    assert.match(result.reason, new RegExp(field));
  }
});

test('rejects the original incident response, auth redirects, and HTML error pages', async () => {
  for (const response of [json({ ...healthy(), rateLimitReady: false }, 503), new Response('', { status: 302 }), new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } })]) {
    const result = await probeHealth(HEALTH_URL, { fetchImpl: async (_url, options) => {
      assert.equal(options.redirect, 'manual');
      return response;
    } });
    assert.equal(result.ok, false);
  }
});

test('rejects stale, future, missing timestamps and malformed JSON', async () => {
  for (const timestamp of [undefined, 'invalid', new Date(Date.now() - 360_000).toISOString(), new Date(Date.now() + 120_000).toISOString()]) {
    const result = await probeHealth(HEALTH_URL, { fetchImpl: async () => json({ ...healthy(), timestamp }) });
    assert.equal(result.ok, false);
  }
  const malformed = await probeHealth(HEALTH_URL, { fetchImpl: async () => new Response('{', { headers: { 'content-type': 'application/json' } }) });
  assert.equal(malformed.reason, 'Invalid JSON response');
});

test('network exceptions never expose their raw message', async () => {
  const result = await probeHealth(HEALTH_URL, { fetchImpl: async () => { throw new Error('ENOTFOUND secret-provider-host secret-token'); } });
  assert.equal(result.reason, 'Network request failed');
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});

test('retries transient errors, stops after recovery, and bounds a sustained outage', async () => {
  let calls = 0;
  const delays = [];
  const recovered = await checkHealth({ sleepImpl: async ms => delays.push(ms), fetchImpl: async () => ++calls === 1 ? json({}, 503) : json(healthy()) });
  assert.equal(recovered.ok, true);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [10_000]);
  const failed = await checkHealth({ sleepImpl: async () => {}, fetchImpl: async () => json({}, 503) });
  assert.equal(failed.ok, false);
  assert.equal(failed.observations.length, 3);
  await assert.rejects(checkHealth({ attempts: 0 }), /attempt/);
});

async function serve(t, handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('timeout covers response body reads as well as connection setup', async t => {
  const base = await serve(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{');
    // Intentionally never finish the body. The client's deadline must abort it.
  });
  const result = await probeHealth(base, { timeoutMs: 100 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'Request timed out');
});

test('HTTP integration: rejects an outage and passes after dependency recovery', async t => {
  let isHealthy = false;
  let requests = 0;
  const base = await serve(t, (_req, res) => {
    requests++;
    res.writeHead(isHealthy ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ...healthy(), rateLimitReady: isHealthy }));
  });
  const failed = await checkHealth({ url: base, delayMs: 0 });
  assert.equal(failed.ok, false);
  assert.equal(requests, 3);
  assert.ok(failed.observations.every(item => item.httpStatus === 503));
  isHealthy = true;
  const recovered = await checkHealth({ url: base, delayMs: 0 });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.observations.length, 1);
  assert.equal(recovered.observations[0].httpStatus, 200);
  assert.equal(requests, 4);
});
