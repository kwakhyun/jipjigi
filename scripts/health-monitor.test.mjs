import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { checkHealth, HEALTH_URL, probeHealth } from './health-check.mjs';
import { githubClient, INCIDENT_MARKER, INCIDENT_TITLE, syncHealthIssue } from './health-alert.mjs';

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

test('HTTP integration: outage -> one assigned incident -> recovery -> new recurrence', async t => {
  let isHealthy = false;
  const issues = [];
  const comments = [];
  let posts = 0;
  const base = await serve(t, async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/health') {
      res.statusCode = isHealthy ? 200 : 503;
      res.end(JSON.stringify({ ...healthy(), rateLimitReady: isHealthy }));
      return;
    }
    assert.equal(req.headers.authorization, 'Bearer test-only-token');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    if (req.method === 'GET') res.end(JSON.stringify(issues.filter(issue => issue.state === 'open')));
    else if (req.method === 'POST' && req.url.endsWith('/comments')) {
      comments.push(body);
      res.end('{}');
    } else if (req.method === 'POST') {
      posts++;
      issues.push({ ...body, number: posts, state: 'open', user: { login: 'github-actions[bot]' } });
      res.statusCode = 201;
      res.end(JSON.stringify(issues.at(-1)));
    } else if (req.method === 'PATCH') {
      Object.assign(issues.find(issue => issue.number === Number(req.url.split('/').at(-1))), body);
      res.end('{}');
    } else { res.statusCode = 404; res.end('{}'); }
  });
  const fetchImpl = (url, options) => fetch(`${base}${new URL(url).pathname}${new URL(url).search}`, options);
  const context = {
    api: githubClient({ token: 'test-only-token', repository: 'owner/repo', fetchImpl }),
    repository: 'owner/repo', assignee: 'owner', runId: '123',
  };
  const run = async () => (await syncHealthIssue(await checkHealth({ fetchImpl, delayMs: 0 }), context)).state;
  assert.equal(await run(), 'opened');
  assert.equal(await run(), 'ongoing');
  assert.equal(posts, 1);
  assert.deepEqual(issues[0].assignees, ['owner']);
  assert.match(issues[0].body, /HTTP 503/);
  assert.match(issues[0].body, /actions\/runs\/123/);
  isHealthy = true;
  assert.equal(await run(), 'recovered');
  assert.equal(comments.length, 1);
  assert.equal(issues[0].state, 'closed');
  assert.equal(await run(), 'healthy');
  assert.equal(comments.length, 1);
  isHealthy = false;
  assert.equal(await run(), 'opened');
  assert.equal(posts, 2);
});

test('paginates issues and never closes unrelated issues or pull requests', async () => {
  const calls = [];
  const unrelated = { number: 1, state: 'open', title: INCIDENT_TITLE, body: INCIDENT_MARKER, user: { login: 'someone-else' } };
  const context = {
    repository: 'owner/repo', assignee: 'owner', runId: '123',
    api: async (path, options) => {
      calls.push([path, options]);
      const page = new URL(path, 'https://api.github.com').searchParams.get('page');
      if (page === '1') return Array.from({ length: 100 }, () => unrelated);
      if (page === '2') return [
        { ...unrelated, number: 2, user: { login: 'github-actions[bot]' }, pull_request: {} },
        { ...unrelated, number: 3, user: { login: 'github-actions[bot]' } },
      ];
      return {};
    },
  };
  const result = await checkHealth({ fetchImpl: async () => json(healthy()) });
  assert.equal((await syncHealthIssue(result, context)).state, 'recovered');
  assert.deepEqual(calls.filter(([, options]) => options).map(([path]) => path), ['/issues/3/comments', '/issues/3']);
});

test('missing health results and GitHub API errors fail visibly without leaking credentials', async () => {
  await assert.rejects(syncHealthIssue({}, { api: () => assert.fail('must not call GitHub') }), /invalid health result/);
  const api = githubClient({ token: 'secret-token', repository: 'owner/repo', fetchImpl: async () => json({ message: 'private-provider-details' }, 403) });
  await assert.rejects(api('/issues'), error => error.message.includes('HTTP 403') && !/secret|private/.test(error.message));
});

test('notification drills cannot resolve a real incident', async () => {
  const context = {
    repository: 'owner/repo', assignee: 'owner', runId: '123', drill: true,
    api: async (_path, options) => {
      assert.equal(options, undefined, 'a real incident must not be modified by a drill');
      return [{ number: 1, state: 'open', title: INCIDENT_TITLE, body: INCIDENT_MARKER, user: { login: 'github-actions[bot]' } }];
    },
  };
  const result = await checkHealth({ fetchImpl: async () => json(healthy()) });
  assert.equal((await syncHealthIssue(result, context)).state, 'healthy');
});

test('recovers a just-created notification even while the GitHub issue list is stale', async () => {
  let issue;
  const comments = [];
  const context = {
    repository: 'owner/repo', assignee: 'owner', runId: '123', drill: true,
    api: async (path, options) => {
      if (path.startsWith('/issues?')) return [];
      if (path === '/issues' && options.method === 'POST') {
        issue = { ...options.body, number: 42, state: 'open', user: { login: 'github-actions[bot]' } };
        return issue;
      }
      if (path === '/issues/42/comments') { comments.push(options.body); return {}; }
      if (path === '/issues/42') {
        if (options?.method === 'PATCH') Object.assign(issue, options.body);
        return issue;
      }
      assert.fail(`Unexpected API request: ${path}`);
    },
  };
  const result = await checkHealth({ fetchImpl: async () => json(healthy()) });
  const opened = await syncHealthIssue({ ...result, ok: false }, context);
  assert.equal(opened.state, 'opened');
  const recovered = await syncHealthIssue(result, { ...context, knownIssueNumbers: opened.incidentNumbers });
  assert.equal(recovered.state, 'recovered');
  assert.equal(issue.state, 'closed');
  assert.equal(comments.length, 1);
});
