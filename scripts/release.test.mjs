import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRelease, runReleaseRulesGate, withReleaseLock } from './release.mjs';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const config = { commit: 'a'.repeat(40), remoteCommit: 'a'.repeat(40), serviceId: 'srv-fixture', baseURL: 'https://fixture.onrender.com', repo: 'https://github.com/example/fixture.git', branch: 'main' };

test('requires the engine and independent rules gate before deployment', () => {
  const calls = [];
  runReleaseRulesGate((command, args) => { calls.push([command, args]); return { status: 0 }; }, '/fixture');
  assert.deepEqual(calls[0][1], ['run', 'verify:rules']);
  assert.throws(() => runReleaseRulesGate(() => ({ status: 1 }), '/fixture'), /Deployment was not started/);
});
function harness(options = {}) {
  const calls = []; const reports = []; let now = 0;
  const deployment = { id: 'dep-fixture', status: 'build_in_progress', commit: { id: config.commit } };
  return { calls, reports, deps: {
    now: () => now, sleep: async (ms) => { now += ms; }, record: (report) => reports.push(report),
    prove: async (check) => { calls.push(check); if (options.proofFailure === check) throw new Error('Proof failed'); },
    api: async (method, endpoint) => {
      calls.push(`${method} ${endpoint}`);
      if (endpoint.endsWith('/srv-fixture')) return { repo: config.repo, branch: options.wrongBranch ? 'other' : 'main', rootDir: 'imperium-like-digital-prototype', serviceDetails: { runtime: 'node', envSpecificDetails: { buildCommand: options.buildDrift ? 'wrong' : 'npm ci && npm run build -w app && npm run typecheck', startCommand: 'npm run start' }, healthCheckPath: '/polity/accounts/health', url: config.baseURL, disk: { mountPath: '/var/data' } } };
      if (endpoint.includes('env-vars')) return Object.entries({ POLITY_SERVER_ORIGIN: options.drift ? 'wrong' : config.baseURL, POLITY_STORAGE_PATH: '/var/data/polity-engine', SECRET: 'must-not-appear' }).map(([key, value]) => ({ envVar: { key, value } }));
      if (method === 'POST') { if (options.uncertain) throw new Error('SECRET must-not-appear'); return deployment; }
      if (endpoint.includes('?limit=20')) return options.existing ? [{ deploy: { ...deployment, ...options.existing } }] : [];
      if (endpoint.endsWith('/dep-fixture')) return { ...deployment, status: options.finalStatus ?? 'live', commit: { id: options.wrongCommit ? 'b'.repeat(40) : config.commit } };
      throw new Error('Unexpected endpoint');
    }
  } };
}
test('deploys then proves exact commit and records a redacted report', async () => {
  const h = harness(); const result = await runRelease(config, h.deps);
  assert.equal(result.status, 'verified');
  assert.equal(h.calls.filter((c) => c.startsWith('POST')).length, 1);
  assert.deepEqual(result.checks.slice(-3), ['origin-and-commit', 'smoke', 'browser']);
  assert.ok(!JSON.stringify(h.reports).includes('must-not-appear'));
});
test('dry run makes no deployment or proof calls', async () => {
  const h = harness(); assert.equal((await runRelease({ ...config, dryRun: true }, h.deps)).status, 'dry-run-ready');
  assert.ok(!h.calls.some((c) => c.startsWith('POST') || c === 'smoke'));
});
test('reuses a matching active deployment', async () => {
  const h = harness({ existing: {} }); await runRelease(config, h.deps);
  assert.ok(!h.calls.some((c) => c.startsWith('POST')));
});
test('refuses another in-flight commit', async () => {
  const h = harness({ existing: { commit: { id: 'b'.repeat(40) } } });
  await assert.rejects(runRelease(config, h.deps), /Another commit/);
  assert.ok(!h.calls.some((c) => c.startsWith('POST')));
});
for (const [name, options] of Object.entries({ drift: { drift: true }, build: { buildDrift: true }, identity: { wrongBranch: true }, failed: { finalStatus: 'build_failed' }, stale: { wrongCommit: true }, proof: { proofFailure: 'origin-and-commit' } })) {
  test(`stops on ${name}`, async () => {
    const h = harness(options); await assert.rejects(runRelease(config, h.deps));
    assert.ok(!h.calls.includes('browser'));
    assert.equal(h.reports.at(-1).status, 'failed');
  });
}
test('bounds polling and preserves deployment ID', async () => {
  const h = harness({ finalStatus: 'build_in_progress' });
  await assert.rejects(runRelease({ ...config, timeoutMs: 1 }, h.deps), /timed out/);
  assert.equal(h.reports.at(-1).status, 'timeout'); assert.equal(h.reports.at(-1).deploymentId, 'dep-fixture');
});
test('uncertain submissions are recorded and never blindly retried', async () => {
  const h = harness({ uncertain: true }); await assert.rejects(runRelease(config, h.deps), /uncertain/);
  assert.equal(h.reports.at(-1).status, 'submission-uncertain');
  assert.ok(!JSON.stringify(h.reports).includes('must-not-appear'));
  const retry = harness(); await assert.rejects(runRelease({ ...config, previous: h.reports.at(-1) }, retry.deps), /uncertain/);
  assert.ok(!retry.calls.some((c) => c.startsWith('POST')));
  assert.equal(retry.reports.at(-1).status, 'submission-uncertain');
});
test('rejects unverified remote commits before contacting Render', async () => {
  const h = harness(); await assert.rejects(runRelease({ ...config, remoteCommit: 'b'.repeat(40) }, h.deps), /remote branch tip/);
  assert.deepEqual(h.calls, []);
});

test('finds an active deployment beyond the first page and does not resubmit', async () => {
  const h = harness({ existing: {} });
  const api = h.deps.api;
  h.deps.api = async (method, endpoint, body) => {
    if (endpoint.endsWith('/deploys?limit=20')) return Array.from({ length: 20 }, (_, index) => ({ cursor: `cursor-${index}`, deploy: { id: `dep-old${index}`, status: 'deactivated', commit: { id: 'b'.repeat(40) } } }));
    if (endpoint.includes('&cursor=')) return api(method, endpoint.split('&')[0], body);
    return api(method, endpoint, body);
  };
  await runRelease(config, h.deps);
  assert.ok(!h.calls.some((call) => call.startsWith('POST')));
});

test('serializes local releases and releases the lock after errors', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'polity-release-lock-'));
  const path = join(directory, 'service.lock');
  try {
    await assert.rejects(withReleaseLock(path, async () => {
      await assert.rejects(withReleaseLock(path, () => assert.fail('Concurrent release entered')), /lock already exists/);
      throw new Error('fixture failure');
    }), /fixture failure/);
    assert.equal(existsSync(path), false);
    assert.equal(await withReleaseLock(path, () => 'released'), 'released');
  } finally { rmSync(directory, { recursive: true }); }
});
