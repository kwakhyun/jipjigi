import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HEALTH_URL, healthSummary } from './health-check.mjs';

export const INCIDENT_MARKER = '<!-- jipjigi-production-health:v1 -->';
export const INCIDENT_TITLE = '[운영 장애] Jipjigi 헬스체크 실패';

export function githubClient({ token, repository, fetchImpl = fetch }) {
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) throw new Error('Missing GitHub credentials or repository');
  return async (path, { method = 'GET', body } = {}) => {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}${path}`, {
      method,
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`GitHub API ${method} failed: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
}

export async function syncHealthIssue(result, { api, repository, assignee, runId, drill = false, knownIssueNumbers = [] }) {
  if (typeof result?.ok !== 'boolean' || result.url !== HEALTH_URL || !Number.isFinite(Date.parse(result.checkedAt)) || !result.observations?.length) {
    throw new Error('Missing or invalid health result; refusing to change incident state');
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^\d+$/.test(runId) || !/^[a-zA-Z0-9-]+$/.test(assignee)) {
    throw new Error('Invalid GitHub alert context');
  }
  // A manual notification drill must never open or resolve a real incident.
  const marker = drill ? '<!-- jipjigi-health-notification-drill:v1 -->' : INCIDENT_MARKER;
  const title = drill ? '[알림 테스트] Jipjigi 헬스체크 전달 확인' : INCIDENT_TITLE;
  const isIncident = issue => !issue.pull_request && issue.state === 'open' && issue.user?.login === 'github-actions[bot]' && issue.title === title && issue.body?.includes(marker);
  const incidents = [];
  for (let page = 1; ; page++) {
    const issues = await api(`/issues?state=open&per_page=100&page=${page}`);
    incidents.push(...issues.filter(isIncident));
    if (issues.length < 100) break;
  }
  // GitHub's issue list may lag behind a successful creation. Read known IDs directly.
  for (const number of knownIssueNumbers) {
    if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid incident number');
    if (incidents.some(issue => issue.number === number)) continue;
    const issue = await api(`/issues/${number}`);
    if (isIncident(issue)) incidents.push(issue);
  }
  const runUrl = `https://github.com/${repository}/actions/runs/${runId}`;
  const evidence = `${healthSummary(result)}\n[검사 실행 기록](${runUrl}), [장애 대응 런북](https://github.com/${repository}/blob/main/docs/RUNBOOK.md#redis-장애-대응)\n`;
  if (!result.ok) {
    if (incidents.length) return { state: 'ongoing', incidentNumbers: incidents.map(issue => issue.number) };
    const created = await api('/issues', { method: 'POST', body: {
      title,
      assignees: [assignee],
      body: `${marker}\n${drill ? '실제 장애가 아닌 수동 알림 테스트입니다. 생성, 담당자 할당, 복구 댓글과 종료 경로를 확인합니다.' : '운영 주소의 헬스체크가 재시도 후에도 실패했습니다.'} @${assignee}\n\n${evidence}\n같은 장애가 지속되는 동안 추가 이슈나 댓글을 만들지 않습니다. 정상 응답이 확인되면 자동으로 복구 댓글을 남기고 닫습니다.`,
    } });
    if (!Number.isSafeInteger(created?.number)) throw new Error('Missing created incident number');
    return { state: 'opened', incidentNumbers: [created.number] };
  }
  for (const incident of incidents) {
    await api(`/issues/${incident.number}/comments`, { method: 'POST', body: { body: `${drill ? '수동 알림 테스트를 완료했습니다. 실제 운영 장애를 발생시키지 않았습니다.' : '운영 서비스의 DB와 Redis가 정상 응답하여 복구를 확인했습니다.'}\n\n${evidence}` } });
    await api(`/issues/${incident.number}`, { method: 'PATCH', body: { state: 'closed', state_reason: 'completed' } });
  }
  return { state: incidents.length ? 'recovered' : 'healthy', incidentNumbers: incidents.map(issue => issue.number) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const repository = process.env.GITHUB_REPOSITORY;
    const result = JSON.parse(await readFile(process.env.HEALTH_RESULT_PATH, 'utf8'));
    const context = {
      api: githubClient({ token: process.env.GITHUB_TOKEN, repository }),
      repository,
      assignee: process.env.HEALTH_ALERT_ASSIGNEE || repository.split('/')[0],
      runId: process.env.GITHUB_RUN_ID,
      drill: process.env.HEALTH_ALERT_TEST === 'true',
    };
    if (context.drill) {
      if (!result.ok) throw new Error('Notification drill requires a healthy service');
      const opened = await syncHealthIssue({ ...result, ok: false, observations: [{ ok: false, httpStatus: null, reason: 'Manual notification drill (simulated failure)' }] }, context);
      context.knownIssueNumbers = opened.incidentNumbers;
    }
    const outcome = await syncHealthIssue(result, context);
    if (context.drill && outcome.state !== 'recovered') throw new Error('Notification drill did not complete recovery');
    console.log(`Health incident: ${outcome.state}`);
  } catch {
    console.error('Health alert synchronization failed. Check the result file, issues permission, and assignee.');
    process.exitCode = 1;
  }
}
